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
import io.autocomplete.skip.ContextualSkip
import io.autocomplete.util.IgnoreRules
import java.net.http.HttpClient
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

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
) {
    private val generation = AtomicLong(0)
    private val executor =
        Executors.newCachedThreadPool { r ->
            Thread(r, "auto-complete-engine").apply { isDaemon = true }
        }
    private val inflight = ConcurrentHashMap<String, Job>()
    private val globalInflight = AtomicInteger(0)
    private val latencySamples = ArrayList<Long>()

    @Volatile private var debounceMs: Long = Debouncer.INITIAL_MS

    @Volatile private var history = SuggestionCache(settings.current().cacheSize)

    @Volatile private var lru = PromptLruCache(settings.current().lruSize)
    val backoff = ErrorBackoff()

    data class Job(
        val id: String,
        val generation: Long,
        val token: CancellationToken,
        val future: Future<*>,
    )

    fun currentGeneration(): Long = generation.get()

    fun nextGeneration(): Long = generation.incrementAndGet()

    fun reloadCaches() {
        val s = settings.current()
        history = SuggestionCache(s.cacheSize)
        lru = PromptLruCache(s.lruSize)
        debounceMs = s.debounceInitialMs.toLong().coerceIn(Debouncer.MIN_MS, Debouncer.MAX_MS)
        logs.setRetention(s.logRetention)
    }

    fun completeSync(
        request: CompletionRequest,
        debounce: Boolean = request.trigger == Trigger.AUTO,
        token: CancellationToken = CancellationToken(),
    ): CompletionOutcome {
        val s = settings.current()
        if (!s.isEnabledNow()) {
            log(LogLevel.DEBUG, request, message = "skip disabled or snoozed")
            return CompletionOutcome.Skipped
        }
        if (request.trigger == Trigger.AUTO && !s.autoTrigger) {
            log(LogLevel.DEBUG, request, message = "skip automatic trigger disabled")
            return CompletionOutcome.Skipped
        }
        if (s.disabledLanguages.contains(request.language.lowercase())) {
            log(LogLevel.DEBUG, request, message = "skip disabled language=${request.language}")
            return CompletionOutcome.Skipped
        }
        if (!s.enableInComments && request.context.inComment) {
            log(LogLevel.DEBUG, request, message = "skip comment")
            return CompletionOutcome.Skipped
        }
        if (!s.enableInStrings && request.context.inString) {
            log(LogLevel.DEBUG, request, message = "skip string")
            return CompletionOutcome.Skipped
        }
        val maxBytes = s.maxFileSizeKb.toLong().coerceAtLeast(1) * 1024
        if (request.fileSizeBytes > 0 && request.fileSizeBytes > maxBytes) {
            log(LogLevel.DEBUG, request, message = "skip oversized file")
            return CompletionOutcome.Skipped
        }
        val ignore =
            IgnoreRules(
                s.ignoreGlobs,
                s.respectGitignore,
                projectContexts.gitignorePatterns(request.projectKey),
            )
        if (request.path.isNotBlank() && ignore.isIgnored(request.path)) {
            log(LogLevel.DEBUG, request, message = "skip ignored path")
            return CompletionOutcome.Skipped
        }
        if (s.validationErrors.isNotEmpty()) {
            log(LogLevel.WARN, request, message = "settings invalid")
            return CompletionOutcome.Skipped
        }

        val scope = request.path.ifBlank { "untitled" }
        history.find(scope, request.prefix, request.suffix)?.let { hit ->
            var text = hit.text
            val firstOnly =
                s.firstLineOnlyWhenMidLine &&
                    SuggestionFilter.shouldShowOnlyFirstLine(request.prefix, text)
            text = SuggestionFilter.postprocess(text, request.prefix, request.suffix, firstOnly) ?: return@let
            log(
                LogLevel.INFO,
                request,
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

        if (request.trigger == Trigger.AUTO &&
            ContextualSkip.shouldSkip(request.prefix, request.suffix, request.language)
        ) {
            log(LogLevel.DEBUG, request, message = "contextual skip")
            return CompletionOutcome.Skipped
        }

        if (backoff.blocked()) {
            log(LogLevel.DEBUG, request, message = "backoff blocked status=${backoff.getFatalStatus()}")
            return CompletionOutcome.Skipped
        }

        if (debounce) {
            val delay =
                debounceMs.coerceIn(
                    s.debounceMinMs.toLong().coerceAtLeast(Debouncer.MIN_MS),
                    s.debounceMaxMs.toLong().coerceAtLeast(Debouncer.MIN_MS),
                )
            try {
                sleeper(delay, token)
            } catch (_: CancelledException) {
                return CompletionOutcome.Cancelled
            } catch (_: InterruptedException) {
                return CompletionOutcome.Cancelled
            }
            if (token.isCancelled() || request.generation != generation.get()) return CompletionOutcome.Cancelled
        }

        val started = System.currentTimeMillis()
        return try {
            token.throwIfCancelled()
            val prompt =
                PromptBuilder.build(
                    prefix = request.prefix,
                    suffix = request.suffix,
                    maxPrefixChars = s.maxPrefixChars,
                    maxSuffixChars = s.maxSuffixChars,
                    path = request.path,
                    language = request.language,
                    sendFilePath = s.sendFilePath,
                    recentSnippets =
                        projectContexts.recentSnippets(
                            request.projectKey,
                            s.enableRecentFileContext,
                            s.recentFileLimit,
                            s.recentFileMaxChars,
                        ),
                )
            if (s.logPromptBodies) {
                log(
                    LogLevel.DEBUG,
                    request,
                    message = "prompt prefix=${prompt.prefix.take(200)} suffix=${prompt.suffix.take(80)}",
                    prefixChars = prompt.prefix.length,
                    suffixChars = prompt.suffix.length,
                )
            }
            val lruKey = PromptBuilder.lruKey(request.language, s.model, prompt.prefix, prompt.suffix)
            lru.get(lruKey)?.let { cached ->
                val firstOnly =
                    s.firstLineOnlyWhenMidLine &&
                        SuggestionFilter.shouldShowOnlyFirstLine(request.prefix, cached)
                val text =
                    SuggestionFilter.postprocess(cached, request.prefix, request.suffix, firstOnly)
                        ?: return@let
                history.put(CachedSuggestion(scope, request.prefix, request.suffix, text))
                log(LogLevel.INFO, request, cacheHit = true, latencyMs = 0, message = "lru hit")
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

            token.throwIfCancelled()
            if (request.generation != generation.get()) return CompletionOutcome.Cancelled

            val providerConfig = s.providerConfig.copy(stream = s.stream)
            val client =
                clientFactory?.invoke(providerConfig)
                    ?: HttpCompletionClient(
                        config = providerConfig,
                        http = httpClientProvider?.invoke() ?: HttpCompletionClient.createDefaultHttpClient(),
                        onLog = { event -> logHttp(request, event) },
                    )
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
                        path = request.path,
                    ),
                    token,
                )
            if (token.isCancelled() || request.generation != generation.get()) return CompletionOutcome.Cancelled
            val latency = System.currentTimeMillis() - started
            recordLatency(latency)
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
                    latencyMs = latency,
                    status = providerResponse.rawStatus,
                    message = "empty after filter",
                    prefixChars = prompt.prefix.length,
                    suffixChars = prompt.suffix.length,
                )
                return CompletionOutcome.Skipped
            }
            history.put(CachedSuggestion(scope, request.prefix, request.suffix, text))
            lru.put(lruKey, text)
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
            log(LogLevel.DEBUG, request, message = "cancelled")
            CompletionOutcome.Cancelled
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            log(LogLevel.DEBUG, request, message = "cancelled-interrupt")
            CompletionOutcome.Cancelled
        } catch (e: Exception) {
            if (token.isCancelled() || request.generation != generation.get() || Thread.currentThread().isInterrupted) {
                return CompletionOutcome.Cancelled
            }
            val status = (e as? HttpStatusException)?.status
            val kind = backoff.failure(e, status)
            log(
                if (kind == ErrorKind.FATAL) LogLevel.ERROR else LogLevel.WARN,
                request,
                status = status,
                error = e.message.orEmpty(),
                message = "fail kind=$kind",
            )
            if (kind == ErrorKind.FATAL && s.notifyOnFatalError) {
                onFatal?.invoke(status, e.message.orEmpty())
            }
            CompletionOutcome.Failed(e.message.orEmpty(), status, kind.name.lowercase())
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
        if (globalInflight.get() >= max) {
            // Drop another scope when at global capacity.
            inflight.keys.firstOrNull { it != scope }?.let { cancelScope(it) }
        }

        val token = CancellationToken()
        val gen = if (request.generation == 0L) nextGeneration() else request.generation
        val req = if (request.generation == gen) request else request.copy(generation = gen)

        // Register a placeholder so cancelScope can find the token immediately.
        val placeholder = Job(req.id, req.generation, token, CompletableNoopFuture)
        inflight[scope] = placeholder
        globalInflight.incrementAndGet()

        val future =
            executor.submit {
                try {
                    val outcome = completeSync(req, debounce = debounce, token = token)
                    if (!token.isCancelled() && req.generation == generation.get()) {
                        onDone(outcome)
                    } else {
                        onDone(CompletionOutcome.Cancelled)
                    }
                } catch (_: CancelledException) {
                    onDone(CompletionOutcome.Cancelled)
                } catch (e: Exception) {
                    onDone(CompletionOutcome.Failed(e.message.orEmpty()))
                } finally {
                    globalInflight.decrementAndGet()
                    val current = inflight[scope]
                    if (current?.id == req.id) inflight.remove(scope)
                }
            }
        inflight[scope] = Job(req.id, req.generation, token, future)
    }

    fun cancelAll() {
        generation.incrementAndGet()
        inflight.keys.toList().forEach { cancelScope(it) }
    }

    fun cancelScope(scope: String) {
        val job = inflight.remove(scope) ?: return
        job.token.cancel()
        job.future.cancel(true)
    }

    fun dispose() {
        cancelAll()
        executor.shutdownNow()
    }

    fun newRequestId(): String = UUID.randomUUID().toString()

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

    private fun recordLatency(ms: Long) {
        synchronized(latencySamples) {
            latencySamples += ms
            while (latencySamples.size > 50) latencySamples.removeAt(0)
            debounceMs = Debouncer.nextDelay(debounceMs, latencySamples)
            val s = settings.current()
            debounceMs =
                debounceMs.coerceIn(
                    s.debounceMinMs.toLong().coerceAtLeast(Debouncer.MIN_MS),
                    s.debounceMaxMs.toLong().coerceAtMost(Debouncer.MAX_MS).coerceAtLeast(Debouncer.MIN_MS),
                )
        }
    }

    private fun log(
        level: LogLevel,
        request: CompletionRequest,
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
            settings.current().logLevel,
        )
    }

    private fun logHttp(
        request: CompletionRequest,
        event: HttpLogEvent,
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
            settings.current().logLevel,
        )
    }
}
