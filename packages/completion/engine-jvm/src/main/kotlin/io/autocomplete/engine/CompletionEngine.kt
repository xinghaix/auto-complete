package io.autocomplete.engine

import io.autocomplete.cache.PromptLruCache
import io.autocomplete.cache.SuggestionCache
import io.autocomplete.client.CancellationToken
import io.autocomplete.client.CancelledException
import io.autocomplete.client.CompletionClient
import io.autocomplete.client.ErrorBackoff
import io.autocomplete.client.ErrorKind
import io.autocomplete.client.HttpCompletionClient
import io.autocomplete.client.HttpLogEvent
import io.autocomplete.client.HttpStatusException
import io.autocomplete.client.ProviderRequest
import io.autocomplete.context.ProjectContextProvider
import io.autocomplete.filter.SuggestionFilter
import io.autocomplete.log.LogBuffer
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.prompt.PromptBuilder
import io.autocomplete.prompt.WireFormat
import io.autocomplete.skip.ContextualSkip
import io.autocomplete.util.IgnoreRules
import io.autocomplete.util.SecretRedactor
import java.net.http.HttpClient
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.ceil

/**
 * Core completion pipeline with real cancelable async jobs.
 */
class CompletionEngine(
    private val settings: SettingsSource,
    private val logs: LogBuffer,
    private val projectContexts: ProjectContextProvider = ProjectContextProvider(),
    private val clientFactory: ((io.autocomplete.client.ProviderConfig) -> CompletionClient)? = null,
    /** Optional IDE-aware HTTP client (proxy / trust store). Used when [clientFactory] is null. */
    private val httpClientProvider: (() -> HttpClient)? = null,
    private val sleeper: (Long, CancellationToken) -> Unit = { ms, token ->
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) {
            token.throwIfCancelled()
            val remain = end - System.currentTimeMillis()
            if (remain <= 0) break
            Thread.sleep(minOf(20L, remain))
        }
    },
    private val onFatal: ((Int?, String) -> Unit)? = null,
    val backoff: ErrorBackoff = ErrorBackoff(),
) {
    private val generationCounter = AtomicLong(0)
    private val globalGeneration = AtomicLong(0)
    private val scopeGenerations = ConcurrentHashMap<String, Long>()
    private val executor =
        Executors.newCachedThreadPool { r ->
            Thread(r, "auto-complete-engine").apply { isDaemon = true }
        }
    private val inflight = ConcurrentHashMap<String, Job>()
    private val latencySamples = ArrayList<Long>()
    private val defaultHttpClientRef = AtomicReference<HttpClient?>(null)

    private val totalRequests = AtomicLong(0)
    private val cacheHits = AtomicLong(0)
    private val cancelledCount = AtomicLong(0)
    private val failedCount = AtomicLong(0)
    private val acceptedCount = AtomicLong(0)

    @Volatile private var debounceMs: Long

    @Volatile private var history: SuggestionCache

    @Volatile private var lru: PromptLruCache

    init {
        val initial = settings.current()
        history = SuggestionCache(initial.cacheSize)
        lru = PromptLruCache(initial.lruSize)
        val (minMs, maxMs) = normalizedDebounceBounds(initial)
        debounceMs = initial.debounceInitialMs.toLong().coerceIn(minMs, maxMs)
    }

    data class Job(
        val id: String,
        val generation: Long,
        val token: CancellationToken,
        val futureRef: AtomicReference<Future<*>?> = AtomicReference(null),
        val createdAtNanos: Long = System.nanoTime(),
    ) {
        val future: Future<*>
            get() = futureRef.get() ?: CompletableNoopFuture
    }

    fun currentGeneration(): Long = globalGeneration.get()

    fun nextGeneration(): Long {
        val next = generationCounter.incrementAndGet()
        globalGeneration.accumulateAndGet(next, ::maxOf)
        return next
    }

    fun currentGeneration(scope: String): Long =
        maxOf(scopeGenerations[scope] ?: 0L, globalGeneration.get())

    fun nextGeneration(scope: String): Long {
        if (scopeGenerations.size > MAX_TRACKED_SCOPE_GENERATIONS) {
            scopeGenerations.keys.removeIf { key -> key != scope && !inflight.containsKey(key) }
        }
        val next = generationCounter.incrementAndGet()
        scopeGenerations.merge(scope, next, ::maxOf)
        return next
    }

    fun reloadCaches() {
        val s = settings.current()
        history = SuggestionCache(s.cacheSize)
        lru = PromptLruCache(s.lruSize)
        backoff.reset()
        val (minMs, maxMs) = normalizedDebounceBounds(s)
        debounceMs = s.debounceInitialMs.toLong().coerceIn(minMs, maxMs)
        logs.setRetention(s.logRetention)
    }

    fun resetBackoff() {
        backoff.reset()
    }

    fun clearCaches() {
        history.clear()
        lru.clear()
        backoff.reset()
    }

    fun recordAccepted() {
        acceptedCount.incrementAndGet()
    }

    fun sessionStats(): SessionStats {
        val sorted =
            synchronized(latencySamples) {
                latencySamples.sorted()
            }
        val p50 = percentile(sorted, 50)
        val p95 = percentile(sorted, 95)
        return SessionStats(
            totalRequests = totalRequests.get(),
            cacheHits = cacheHits.get(),
            cancelled = cancelledCount.get(),
            failed = failedCount.get(),
            accepted = acceptedCount.get(),
            p50LatencyMs = p50,
            p95LatencyMs = p95,
            currentDebounceMs = debounceMs,
            backoffBlocked = backoff.blocked(),
            backoffFatal = backoff.isFatal(),
        )
    }

    fun completeSync(
        request: CompletionRequest,
        debounce: Boolean = request.trigger == Trigger.AUTO,
        token: CancellationToken = CancellationToken(),
    ): CompletionOutcome {
        val s = settings.current()
        val logLevel = s.logLevel
        if (!s.isEnabledNow()) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip disabled or snoozed")
            return CompletionOutcome.Skipped
        }
        if (request.trigger == Trigger.AUTO && !s.autoTrigger) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip automatic trigger disabled")
            return CompletionOutcome.Skipped
        }
        if (s.disabledLanguages.contains(request.language.lowercase())) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip disabled language=${request.language}")
            return CompletionOutcome.Skipped
        }
        if (!s.enableInComments && request.context.inComment) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip comment")
            return CompletionOutcome.Skipped
        }
        if (!s.enableInStrings && request.context.inString) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip string")
            return CompletionOutcome.Skipped
        }
        val maxBytes = s.maxFileSizeKb.toLong().coerceAtLeast(1) * 1024
        if (request.fileSizeBytes > 0 && request.fileSizeBytes > maxBytes) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip oversized file")
            return CompletionOutcome.Skipped
        }
        val ignore =
            IgnoreRules(
                s.ignoreGlobs,
                s.respectGitignore,
                projectContexts.gitignorePatterns(request.projectKey),
            )
        if (request.path.isNotBlank() && ignore.isIgnored(request.path)) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "skip ignored path")
            return CompletionOutcome.Skipped
        }
        if (s.validationErrors.isNotEmpty()) {
            log(LogLevel.WARN, request, logLevel = logLevel, message = "settings invalid")
            return CompletionOutcome.Skipped
        }

        val scope = request.path.ifBlank { "untitled" }
        if (!request.forceRefresh) {
            history.find(scope, request.prefix, request.suffix)?.let { hit ->
                var text = hit.text
                val firstOnly =
                    s.firstLineOnlyWhenMidLine &&
                        SuggestionFilter.shouldShowOnlyFirstLine(request.prefix, text)
                text = SuggestionFilter.postprocess(text, request.prefix, request.suffix, firstOnly) ?: return@let
                totalRequests.incrementAndGet()
                cacheHits.incrementAndGet()
                log(
                    LogLevel.INFO,
                    request,
                    logLevel = logLevel,
                    cacheHit = true,
                    latencyMs = 0,
                    message = "cache ${hit.match.name.lowercase()}",
                )
                return CompletionOutcome.Success(
                    CompletionResponse(
                        id = request.id,
                        text = text,
                        latencyMs = 0,
                        cached = true,
                        model = s.model,
                        generation = request.generation,
                    ),
                )
            }
        }

        if (request.trigger == Trigger.AUTO &&
            ContextualSkip.shouldSkip(request.prefix, request.suffix, request.language)
        ) {
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "contextual skip")
            return CompletionOutcome.Skipped
        }

        val providerConfig = s.providerConfig.copy(stream = s.stream)
        val template = HttpCompletionClient.resolveTemplate(providerConfig)
        val isStructuredPrompt =
            template.wireFormat() == WireFormat.CHAT_MESSAGES ||
                template.wireFormat() == WireFormat.RESPONSES_API
        val recentSnippets =
            projectContexts.recentSnippets(
                request.projectKey,
                s.enableRecentFileContext,
                s.recentFileLimit,
                s.recentFileMaxChars,
            )
        val prompt =
            PromptBuilder.build(
                prefix = request.prefix,
                suffix = request.suffix,
                maxPrefixChars = s.maxPrefixChars,
                maxSuffixChars = s.maxSuffixChars,
                path = request.path,
                language = request.language,
                sendFilePath = s.sendFilePath,
                recentSnippets = recentSnippets,
                wrapHeaderAsComment = !isStructuredPrompt,
                includeHeaderInPrefix = !isStructuredPrompt,
            )
        val lruKey =
            PromptBuilder.lruKey(
                language = request.language,
                model = s.model,
                prefix = if (prompt.header.isEmpty()) prompt.prefix else prompt.header + "\n" + prompt.prefix,
                suffix = prompt.suffix,
                promptTemplate = template.name,
                baseUrl = providerConfig.baseUrl,
                temperature = s.temperature,
                maxTokens = s.maxTokens,
                firstLineOnlyWhenMidLine = s.firstLineOnlyWhenMidLine,
            )

        // LRU cache check runs BEFORE backoff and debounce so cached responses are instant.
        if (!request.forceRefresh) {
            lru.get(lruKey)?.let { cached ->
                val firstOnly =
                    s.firstLineOnlyWhenMidLine &&
                        SuggestionFilter.shouldShowOnlyFirstLine(request.prefix, cached)
                val text =
                    SuggestionFilter.postprocess(cached, request.prefix, request.suffix, firstOnly)
                        ?: return@let
                history.put(CachedSuggestion(scope, request.prefix, request.suffix, text))
                totalRequests.incrementAndGet()
                cacheHits.incrementAndGet()
                log(LogLevel.INFO, request, logLevel = logLevel, cacheHit = true, latencyMs = 0, message = "lru hit")
                return CompletionOutcome.Success(
                    CompletionResponse(
                        id = request.id,
                        text = text,
                        latencyMs = 0,
                        cached = true,
                        model = s.model,
                        generation = request.generation,
                    ),
                )
            }
        }

        if (backoff.blocked()) {
            val allowProbe = request.trigger == Trigger.MANUAL || backoff.shouldProbe()
            if (!allowProbe) {
                log(
                    LogLevel.DEBUG,
                    request,
                    logLevel = logLevel,
                    message = "backoff blocked status=${backoff.getFatalStatus()}",
                )
                return CompletionOutcome.Skipped
            }
            log(
                LogLevel.INFO,
                request,
                logLevel = logLevel,
                message = "backoff probe trigger=${request.trigger.name}",
            )
        }

        totalRequests.incrementAndGet()

        if (debounce) {
            val (minMs, maxMs) = normalizedDebounceBounds(s)
            val delay = debounceMs.coerceIn(minMs, maxMs)
            try {
                if (delay > 0L) {
                    sleeper(delay, token)
                } else {
                    token.throwIfCancelled()
                }
            } catch (_: CancelledException) {
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            }
            if (token.isCancelled() || !isGenerationCurrent(scope, request.generation)) {
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            }
        }

        val started = System.currentTimeMillis()
        return try {
            token.throwIfCancelled()
            if (!isGenerationCurrent(scope, request.generation)) {
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            }
            if (s.logPromptBodies) {
                log(
                    LogLevel.DEBUG,
                    request,
                    logLevel = logLevel,
                    message = "prompt prefix=${prompt.prefix.take(200)} suffix=${prompt.suffix.take(80)}",
                    prefixChars = prompt.prefix.length,
                    suffixChars = prompt.suffix.length,
                )
            }

            val client =
                clientFactory?.invoke(providerConfig)
                    ?: HttpCompletionClient(
                        config = providerConfig,
                        http = httpClientProvider?.invoke() ?: sharedDefaultHttpClient(),
                        onLog = { event -> logHttp(request, event, logLevel) },
                    )
            val stopAtNewline = s.firstLineOnlyWhenMidLine && SuggestionFilter.isMidLine(request.prefix)
            val providerResponse =
                client.complete(
                    ProviderRequest(
                        model = s.model,
                        prefix = prompt.prefix,
                        suffix = prompt.suffix,
                        maxTokens = s.maxTokens,
                        temperature = s.temperature,
                        stream = s.stream,
                        language = request.language,
                        path = if (s.sendFilePath) request.path else null,
                        stopAtNewline = stopAtNewline,
                        recentSnippets = if (isStructuredPrompt) recentSnippets else emptyList(),
                    ),
                    token,
                )
            if (token.isCancelled() || !isGenerationCurrent(scope, request.generation)) {
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            }
            val latency = System.currentTimeMillis() - started
            recordLatency(latency, s)
            backoff.success()

            val firstOnly =
                s.firstLineOnlyWhenMidLine &&
                    SuggestionFilter.shouldShowOnlyFirstLine(request.prefix, providerResponse.text)
            val text =
                SuggestionFilter.postprocess(
                    providerResponse.text,
                    request.prefix,
                    request.suffix,
                    firstOnly,
                )
            if (text.isNullOrEmpty()) {
                log(
                    LogLevel.INFO,
                    request,
                    logLevel = logLevel,
                    latencyMs = latency,
                    status = providerResponse.rawStatus,
                    message = "empty after filter",
                    prefixChars = prompt.prefix.length,
                    suffixChars = prompt.suffix.length,
                )
                return CompletionOutcome.Skipped
            }
            history.put(CachedSuggestion(scope, request.prefix, request.suffix, text))
            lru.put(lruKey, providerResponse.text)
            val costMsg =
                if (s.showCostApprox) {
                    val inTok = providerResponse.usage?.inputTokens ?: 0
                    val outTok = providerResponse.usage?.outputTokens ?: 0
                    " tokens=$inTok/$outTok"
                } else {
                    ""
                }
            log(
                LogLevel.INFO,
                request,
                logLevel = logLevel,
                latencyMs = latency,
                status = providerResponse.rawStatus,
                message = "ok model=${s.model}$costMsg",
                prefixChars = prompt.prefix.length,
                suffixChars = prompt.suffix.length,
            )
            CompletionOutcome.Success(
                CompletionResponse(
                    id = request.id,
                    text = text,
                    latencyMs = latency,
                    cached = false,
                    model = s.model,
                    usage = providerResponse.usage,
                    generation = request.generation,
                ),
            )
        } catch (_: CancelledException) {
            cancelledCount.incrementAndGet()
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "cancelled")
            CompletionOutcome.Cancelled
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            cancelledCount.incrementAndGet()
            log(LogLevel.DEBUG, request, logLevel = logLevel, message = "cancelled-interrupt")
            CompletionOutcome.Cancelled
        } catch (e: Exception) {
            if (token.isCancelled() ||
                !isGenerationCurrent(scope, request.generation) ||
                Thread.currentThread().isInterrupted
            ) {
                cancelledCount.incrementAndGet()
                return CompletionOutcome.Cancelled
            }
            failedCount.incrementAndGet()
            val status = (e as? HttpStatusException)?.status
            val kind = backoff.failure(e, status)
            val safeError = SecretRedactor.redactText(e.message.orEmpty(), providerConfig.apiKey)
            log(
                if (kind == ErrorKind.FATAL) LogLevel.ERROR else LogLevel.WARN,
                request,
                logLevel = logLevel,
                status = status,
                error = safeError,
                message = "fail kind=$kind",
            )
            if (kind == ErrorKind.FATAL && s.notifyOnFatalError) {
                onFatal?.invoke(status, safeError)
            }
            CompletionOutcome.Failed(safeError, status, kind.name.lowercase())
        }
    }

    fun completeAsync(
        request: CompletionRequest,
        debounce: Boolean = request.trigger == Trigger.AUTO,
        onDone: (CompletionOutcome) -> Unit,
    ) {
        val scope = request.path.ifBlank { "untitled" }
        cancelScope(scope)

        val s = settings.current()
        val max = s.maxInFlight.coerceAtLeast(1)
        // Evict oldest unrelated scope(s) ONLY when active inflight count (already excluding cancelled same-scope) >= max.
        while (inflight.size >= max) {
            val victim =
                inflight.entries
                    .filter { it.key != scope }
                    .minByOrNull { it.value.createdAtNanos }
                    ?: break
            cancelScope(victim.key, victim.value.id)
        }

        val token = CancellationToken()
        val gen = if (request.generation == 0L) nextGeneration(scope) else request.generation
        val req = if (request.generation == gen) request else request.copy(generation = gen)
        val futureRef = AtomicReference<Future<*>?>(null)
        val job = Job(req.id, req.generation, token, futureRef)

        var replaced: Job? = null
        inflight.compute(scope) { _, existing ->
            replaced = existing
            job
        }
        replaced?.let { prev ->
            prev.token.cancel()
            prev.futureRef.get()?.cancel(true)
        }

        val future =
            executor.submit {
                try {
                    val outcome = completeSync(req, debounce = debounce, token = token)
                    if (!token.isCancelled() && isGenerationCurrent(scope, req.generation)) {
                        onDone(outcome)
                    } else {
                        if (outcome !is CompletionOutcome.Cancelled) cancelledCount.incrementAndGet()
                        onDone(CompletionOutcome.Cancelled)
                    }
                } catch (_: CancelledException) {
                    cancelledCount.incrementAndGet()
                    onDone(CompletionOutcome.Cancelled)
                } catch (e: Exception) {
                    failedCount.incrementAndGet()
                    onDone(CompletionOutcome.Failed(SecretRedactor.redactText(e.message.orEmpty())))
                } finally {
                    inflight.computeIfPresent(scope) { _, current ->
                        if (current.id == req.id) null else current
                    }
                }
            }
        futureRef.set(future)
        if (token.isCancelled()) {
            future.cancel(true)
        }
    }

    fun cancelAll() {
        val next = generationCounter.incrementAndGet()
        globalGeneration.accumulateAndGet(next, ::maxOf)
        inflight.keys.toList().forEach { cancelScope(it) }
    }

    @JvmOverloads
    fun cancelScope(
        scope: String,
        expectedRequestId: String? = null,
    ) {
        var cancelledJob: Job? = null
        inflight.compute(scope) { _, current ->
            if (current == null) {
                null
            } else if (expectedRequestId != null && current.id != expectedRequestId) {
                current
            } else {
                cancelledJob = current
                null
            }
        }
        cancelledJob?.let { job ->
            job.token.cancel()
            job.futureRef.get()?.cancel(true)
        }
    }

    fun dispose() {
        cancelAll()
        executor.shutdownNow()
        runCatching { defaultHttpClientRef.getAndSet(null)?.shutdownNow() }
    }

    fun newRequestId(): String = UUID.randomUUID().toString()

    private fun isGenerationCurrent(
        scope: String,
        requestGeneration: Long,
    ): Boolean = requestGeneration == currentGeneration(scope)

    private fun sharedDefaultHttpClient(): HttpClient =
        defaultHttpClientRef.updateAndGet { existing ->
            existing ?: HttpCompletionClient.createDefaultHttpClient()
        }!!

    private fun normalizedDebounceBounds(s: EngineSettings): Pair<Long, Long> {
        val rawMin = s.debounceMinMs.toLong().coerceAtLeast(0L)
        val rawMax = s.debounceMaxMs.toLong().coerceAtLeast(0L)
        return if (rawMin <= rawMax) rawMin to rawMax else rawMax to rawMin
    }

    private fun percentile(
        sorted: List<Long>,
        p: Int,
    ): Long? {
        if (sorted.isEmpty()) return null
        val rank = ceil(sorted.size * (p / 100.0)).toInt() - 1
        return sorted[rank.coerceIn(0, sorted.size - 1)]
    }

    private object CompletableNoopFuture : Future<Unit> {
        override fun cancel(mayInterruptIfRunning: Boolean): Boolean = false

        override fun isCancelled(): Boolean = false

        override fun isDone(): Boolean = true

        override fun get() = Unit

        override fun get(
            timeout: Long,
            unit: TimeUnit,
        ) = Unit
    }

    private fun recordLatency(
        ms: Long,
        s: EngineSettings,
    ) {
        val (minMs, maxMs) = normalizedDebounceBounds(s)
        synchronized(latencySamples) {
            latencySamples += ms
            while (latencySamples.size > 50) latencySamples.removeAt(0)
            debounceMs = Debouncer.nextDelay(debounceMs, latencySamples, minMs, maxMs)
        }
    }

    private fun log(
        level: LogLevel,
        request: CompletionRequest,
        logLevel: String,
        cacheHit: Boolean = false,
        latencyMs: Long? = null,
        status: Int? = null,
        error: String = "",
        message: String = "",
        prefixChars: Int? = null,
        suffixChars: Int? = null,
    ) {
        logs.appendIfEnabled(
            LogEntry(
                level = level,
                requestId = request.id,
                file = request.path,
                trigger = request.trigger.name,
                cacheHit = cacheHit,
                latencyMs = latencyMs,
                status = status,
                error = error,
                prefixChars = prefixChars,
                suffixChars = suffixChars,
                message = message,
            ),
            logLevel,
        )
    }

    private fun logHttp(
        request: CompletionRequest,
        event: HttpLogEvent,
        logLevel: String,
    ) {
        logs.appendIfEnabled(
            LogEntry(
                level = event.level,
                requestId = request.id,
                file = request.path,
                trigger = request.trigger.name,
                latencyMs = event.latencyMs,
                status = event.status,
                error = event.error,
                operation = event.operation,
                method = event.method,
                url = event.url,
                model = event.model,
                requestStyle = event.requestStyle,
                responseChars = event.responseChars,
                message = event.message,
            ),
            logLevel,
        )
    }

    companion object {
        private const val MAX_TRACKED_SCOPE_GENERATIONS = 4096
    }
}
