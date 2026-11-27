package io.autocomplete.client

import io.autocomplete.config.SettingsValidation
import io.autocomplete.engine.Usage
import io.autocomplete.log.LogLevel
import io.autocomplete.prompt.ModelLimits
import io.autocomplete.prompt.PromptBuilder
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.prompt.PromptTemplateDetector
import io.autocomplete.prompt.TemplateProbeResult
import io.autocomplete.prompt.TemplateProbeStatus
import io.autocomplete.prompt.WireFormat
import io.autocomplete.util.Json
import io.autocomplete.util.SecretRedactor
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

data class ProviderRequest(
    val model: String,
    val prefix: String,
    val suffix: String,
    val maxTokens: Int,
    val temperature: Double,
    val stream: Boolean = false,
    val language: String? = null,
    val path: String? = null,
    val stopAtNewline: Boolean = false,
    val recentSnippets: List<String> = emptyList(),
)

data class ProviderResponse(
    val text: String,
    val usage: Usage? = null,
    val rawStatus: Int? = null,
    val emptyReason: String? = null,
)

data class RemoteModel(
    val id: String,
    /** Reported context window in tokens when the provider includes it. */
    val contextLength: Int? = null,
)

data class HttpLogEvent(
    val level: LogLevel,
    val operation: String,
    val method: String,
    val url: String,
    val model: String = "",
    val requestStyle: String = "",
    val status: Int? = null,
    val latencyMs: Long? = null,
    val responseChars: Int? = null,
    val message: String = "",
    val error: String = "",
)

enum class ProviderKind {
    OPENAI_COMPATIBLE,

    /**
     * Legacy alias of OpenAI-compatible + FIM template. Hidden in settings UI;
     * [normalize] maps it to [OPENAI_COMPATIBLE] on load/save.
     */
    MISTRAL_FIM,
    CUSTOM,
    ;

    companion object {
        /** UI only exposes OpenAI-compatible and Custom; collapse legacy Mistral FIM. */
        fun normalize(raw: String?): ProviderKind =
            when (runCatching { valueOf(raw.orEmpty()) }.getOrNull()) {
                CUSTOM -> CUSTOM
                OPENAI_COMPATIBLE, MISTRAL_FIM, null -> OPENAI_COMPATIBLE
            }
    }
}

enum class RequestStyle {
    AUTO,
    FIM,
    CHAT,
}

data class ProviderConfig(
    val kind: ProviderKind,
    val baseUrl: String,
    val apiKey: String,
    val model: String,
    val authHeaderTemplate: String = "Authorization: Bearer \${apiKey}",
    val extraHeadersJson: String = "{}",
    val fimPath: String = "",
    val chatPath: String = "/chat/completions",
    val completionsPath: String = "",
    val responsesPath: String = "",
    val requestStyle: RequestStyle = RequestStyle.AUTO,
    /** Stored template id; [PromptTemplate.AUTO] resolves from model name / baseUrl. */
    val promptTemplate: PromptTemplate = PromptTemplate.AUTO,
    val temperature: Double = 0.0,
    val maxTokens: Int = 128,
    /** Hard timeout for inline completion requests (ghost text path). */
    val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
    /**
     * Hard timeout for settings UI probes: Test Connection, list models, template try-all.
     * Always finite — never “wait forever”.
     */
    val settingsTimeoutMs: Int = DEFAULT_SETTINGS_TIMEOUT_MS,
    val stream: Boolean = false,
    val allowRemote: Boolean = true,
    val extraBodyJson: String = "",
    val stopSequences: String = "",
) {
    companion object {
        const val DEFAULT_TIMEOUT_MS: Int = 3_000
        const val DEFAULT_SETTINGS_TIMEOUT_MS: Int = 15_000
        const val MIN_TIMEOUT_MS: Int = 500
        const val MAX_TIMEOUT_MS: Int = 30_000
        const val MIN_SETTINGS_TIMEOUT_MS: Int = 1_000
        const val MAX_SETTINGS_TIMEOUT_MS: Int = 120_000
    }
}

class CancellationToken {
    private val cancelled = AtomicBoolean(false)
    private val onCancel = AtomicReference<(() -> Unit)?>(null)

    fun cancel() {
        if (cancelled.compareAndSet(false, true)) {
            onCancel.getAndSet(null)?.invoke()
        }
    }

    fun isCancelled(): Boolean = cancelled.get()

    fun throwIfCancelled() {
        if (isCancelled()) throw CancelledException()
    }

    fun onCancel(action: () -> Unit) {
        onCancel.set(action)
        if (isCancelled()) {
            onCancel.getAndSet(null)?.invoke()
        }
    }
}

class CancelledException :
    RuntimeException("cancelled"),
    CancellationStyle

fun interface CompletionClient {
    fun complete(
        request: ProviderRequest,
        token: CancellationToken,
    ): ProviderResponse
}

class HttpCompletionClient(
    private val config: ProviderConfig,
    private val http: HttpClient = sharedDefaultHttpClient(),
    private val operation: String = "completion",
    private val onLog: (HttpLogEvent) -> Unit = {},
) : CompletionClient {
    override fun complete(
        request: ProviderRequest,
        token: CancellationToken,
    ): ProviderResponse = complete(request, token, timeoutMs = completionTimeoutMs())

    fun complete(
        request: ProviderRequest,
        token: CancellationToken,
        timeoutMs: Int,
    ): ProviderResponse {
        validateBaseUrl(config.baseUrl, config.allowRemote)
        token.throwIfCancelled()
        val hardTimeout = timeoutMs.coerceIn(ProviderConfig.MIN_TIMEOUT_MS, ProviderConfig.MAX_SETTINGS_TIMEOUT_MS)
        val template = resolveTemplate(config)
        val wire = template.wireFormat()
        val useStream = request.stream && config.stream
        val path = pathFor(template, config)
        val url = joinUrl(config.baseUrl, path)
        val safeUrl = SecretRedactor.redactUrl(url)
        val body = bodyFor(template, request, config, useStream)
        val settingsOp = isSettingsOperation(operation)
        emitLog(
            HttpLogEvent(
                // Settings probes must be visible at default info log level.
                level = if (settingsOp) LogLevel.INFO else LogLevel.DEBUG,
                operation = operation,
                method = "POST",
                url = safeUrl,
                model = request.model.ifBlank { config.model },
                requestStyle = "${template.name}/${wire.name}",
                message =
                    "request start stream=$useStream template=${template.shortLabel()} " +
                        "timeoutMs=$hardTimeout settingsOp=$settingsOp",
            ),
        )
        val builder =
            HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMillis(hardTimeout.toLong()))
                .header("Content-Type", "application/json")
                .header("Accept", if (useStream) "text/event-stream" else "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
        // Extra headers run BEFORE auth and strictly filter out reserved & sensitive headers.
        applyExtraHeaders(builder, config.extraHeadersJson)
        applyAuth(builder, config)
        token.throwIfCancelled()
        val httpRequest = builder.build()
        return if (useStream) {
            completeStreaming(httpRequest, safeUrl, wire, template, token, hardTimeout, request.stopAtNewline)
        } else {
            completeBlocking(httpRequest, safeUrl, wire, template, token, hardTimeout)
        }
    }

    fun testConnection(): ProviderResponse {
        val token = CancellationToken()
        return complete(probeRequest(), token, timeoutMs = settingsTimeoutMs())
    }

    /**
     * Probe a specific template without mutating this client's config permanently.
     */
    fun probeTemplate(template: PromptTemplate): TemplateProbeResult {
        val concrete = if (template.isAuto()) resolveTemplate(config) else template
        val probeConfig = config.copy(promptTemplate = concrete, requestStyle = RequestStyle.AUTO)
        val client =
            HttpCompletionClient(
                config = probeConfig,
                http = http,
                operation = "template_probe",
                onLog = onLog,
            )
        val path = pathFor(concrete, probeConfig)
        val safeUrl = SecretRedactor.redactUrl(joinUrl(probeConfig.baseUrl, path))
        val started = System.currentTimeMillis()
        return try {
            val resp = client.complete(probeRequest(), CancellationToken(), timeoutMs = settingsTimeoutMs())
            val latency = System.currentTimeMillis() - started
            val preview = resp.text.replace('\n', ' ').trim().take(80)
            if (resp.text.isBlank()) {
                TemplateProbeResult(
                    template = concrete,
                    status = TemplateProbeStatus.EMPTY,
                    httpStatus = resp.rawStatus,
                    latencyMs = latency,
                    preview = preview,
                    resolvedPath = path,
                    resolvedUrl = safeUrl,
                    error = resp.emptyReason ?: "empty completion",
                )
            } else {
                TemplateProbeResult(
                    template = concrete,
                    status = TemplateProbeStatus.SUCCESS,
                    httpStatus = resp.rawStatus,
                    latencyMs = latency,
                    preview = preview,
                    resolvedPath = path,
                    resolvedUrl = safeUrl,
                )
            }
        } catch (e: Exception) {
            val status = (e as? HttpStatusException)?.status
            val rawErr = e.message.orEmpty().ifBlank { e.javaClass.simpleName }
            val hint =
                if (concrete.wireFormat() !in setOf(WireFormat.CHAT_MESSAGES, WireFormat.RESPONSES_API) &&
                    isChatEndpointPath(path)
                ) {
                    " (hint: FIM path override points to /chat/completions; clear FIM path or use CHAT/RESPONSES template)"
                } else {
                    ""
                }
            TemplateProbeResult(
                template = concrete,
                status = TemplateProbeStatus.FAILED,
                httpStatus = status,
                latencyMs = System.currentTimeMillis() - started,
                error = SecretRedactor.redactText(rawErr, config.apiKey) + hint,
                resolvedPath = path,
                resolvedUrl = safeUrl,
            )
        }
    }

    /** Try every concrete template; order is stable so users can iterate. */
    fun probeAllTemplates(): List<TemplateProbeResult> =
        PromptTemplate.probeCandidates().map { probeTemplate(it) }

    private fun probeRequest(): ProviderRequest =
        ProviderRequest(
            model = config.model,
            prefix = "def add(a, b):\n    ",
            suffix = "\n",
            maxTokens = config.maxTokens.coerceIn(16, 1024),
            temperature = 0.0,
            stream = config.stream,
        )

    fun listModels(): List<RemoteModel> {
        validateBaseUrl(config.baseUrl, config.allowRemote)
        val hardTimeout = settingsTimeoutMs()
        val paths = modelPaths(config.baseUrl)
        var lastFailure: RuntimeException? = null
        for (path in paths) {
            val url = joinUrl(config.baseUrl, path)
            val safeUrl = SecretRedactor.redactUrl(url)
            val started = System.currentTimeMillis()
            emitLog(
                HttpLogEvent(
                    level = LogLevel.INFO,
                    operation = "list_models",
                    method = "GET",
                    url = safeUrl,
                    message = "request start timeoutMs=$hardTimeout",
                ),
            )
            val builder =
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofMillis(hardTimeout.toLong()))
                    .header("Accept", "application/json")
                    .GET()
            applyExtraHeaders(builder, config.extraHeadersJson)
            applyAuth(builder, config)
            val future = http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString())
            val response =
                try {
                    future
                        .orTimeout(hardTimeout.toLong(), TimeUnit.MILLISECONDS)
                        .join()
                } catch (e: Exception) {
                    future.cancel(true)
                    val cause = rootCause(e)
                    val detail = SecretRedactor.redactText(formatTransportError(cause, e, hardTimeout), config.apiKey)
                    emitLog(
                        HttpLogEvent(
                            level = LogLevel.WARN,
                            operation = "list_models",
                            method = "GET",
                            url = safeUrl,
                            latencyMs = System.currentTimeMillis() - started,
                            error = detail,
                            message = "request failed",
                        ),
                    )
                    throw RuntimeException("GET $safeUrl failed: $detail", cause)
                }
            if (response.statusCode() in 200..299) {
                val models = parseModels(response.body())
                emitLog(
                    HttpLogEvent(
                        level = LogLevel.INFO,
                        operation = "list_models",
                        method = "GET",
                        url = safeUrl,
                        status = response.statusCode(),
                        latencyMs = System.currentTimeMillis() - started,
                        responseChars = response.body().length,
                        message = "models=${models.size} withContext=${models.count { it.contextLength != null }}",
                    ),
                )
                return models
            }
            val safeBody = SecretRedactor.redactText(response.body().take(300), config.apiKey)
            val failure =
                HttpStatusException(
                    response.statusCode(),
                    "GET $safeUrl -> HTTP ${response.statusCode()}: $safeBody",
                )
            emitLog(
                HttpLogEvent(
                    level = if (response.statusCode() in setOf(401, 403)) LogLevel.ERROR else LogLevel.WARN,
                    operation = "list_models",
                    method = "GET",
                    url = safeUrl,
                    status = response.statusCode(),
                    latencyMs = System.currentTimeMillis() - started,
                    responseChars = response.body().length,
                    error = safeBody,
                    message = if (path == paths.last()) "request failed" else "endpoint unavailable; trying fallback",
                ),
            )
            if (response.statusCode() !in setOf(404, 405) || path == paths.last()) throw failure
            lastFailure = failure
        }
        throw lastFailure ?: IllegalStateException("No model endpoint available")
    }

    private fun completeBlocking(
        request: HttpRequest,
        safeUrl: String,
        wire: WireFormat,
        template: PromptTemplate,
        token: CancellationToken,
        timeoutMs: Int,
    ): ProviderResponse {
        val started = System.currentTimeMillis()
        val response =
            try {
                val future = http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                token.onCancel { future.cancel(true) }
                future.orTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS).join()
            } catch (e: Exception) {
                if (token.isCancelled() || e is InterruptedException || e.cause is InterruptedException) {
                    throw CancelledException()
                }
                val cause = rootCause(e)
                val detail = SecretRedactor.redactText(formatTransportError(cause, e, timeoutMs), config.apiKey)
                emitFailure(request.method(), safeUrl, template, started, null, detail)
                throw RuntimeException("${request.method()} $safeUrl failed: $detail", e)
            }
        token.throwIfCancelled()
        val status = response.statusCode()
        if (status !in 200..299) {
            val rawErr = response.body().trim().ifEmpty { httpStatusFallbackMessage(status) }
            val safeBody = SecretRedactor.redactText(rawErr.take(300), config.apiKey)
            emitFailure(request.method(), safeUrl, template, started, status, safeBody, response.body().length)
            throw HttpStatusException(
                status,
                "${request.method()} $safeUrl -> HTTP $status: $safeBody",
            )
        }
        val text = parseText(wire, response.body())
        val usage = parseUsage(response.body())
        val emptyReason = if (text.isBlank()) diagnoseEmptyResponse(response.body()) else null
        emitSuccess(request.method(), safeUrl, template, started, status, response.body().length, text.length, emptyReason)
        return ProviderResponse(text = text, usage = usage, rawStatus = status, emptyReason = emptyReason)
    }

    private fun completeStreaming(
        request: HttpRequest,
        safeUrl: String,
        wire: WireFormat,
        template: PromptTemplate,
        token: CancellationToken,
        timeoutMs: Int,
        stopAtNewline: Boolean,
    ): ProviderResponse {
        val started = System.currentTimeMillis()
        val response =
            try {
                val future = http.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                token.onCancel { future.cancel(true) }
                future.orTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS).join()
            } catch (e: Exception) {
                if (token.isCancelled() || e is InterruptedException || e.cause is InterruptedException) {
                    throw CancelledException()
                }
                val cause = rootCause(e)
                val detail = SecretRedactor.redactText(formatTransportError(cause, e, timeoutMs), config.apiKey)
                emitFailure(request.method(), safeUrl, template, started, null, detail)
                throw RuntimeException("${request.method()} $safeUrl failed: $detail", e)
            }

        val stream = response.body()
        val status = response.statusCode()
        if (token.isCancelled()) {
            runCatching { stream.close() }
            throw CancelledException()
        }
        if (status !in 200..299) {
            val fallbackMsg = httpStatusFallbackMessage(status)
            val errorText =
                runCatching {
                    stream.use { input ->
                        val buf = ByteArray(1024)
                        val read = input.read(buf)
                        if (read > 0) String(buf, 0, read, StandardCharsets.UTF_8).trim().ifEmpty { fallbackMsg } else fallbackMsg
                    }
                }.getOrDefault(fallbackMsg)
            val safeError = SecretRedactor.redactText(errorText.take(300), config.apiKey)
            emitFailure(request.method(), safeUrl, template, started, status, safeError)
            throw HttpStatusException(status, "${request.method()} $safeUrl -> HTTP $status: $safeError")
        }

        val timedOut = AtomicBoolean(false)
        token.onCancel { runCatching { stream.close() } }
        val remainingMs = (timeoutMs.toLong() - (System.currentTimeMillis() - started)).coerceAtLeast(1L)
        val watchdog =
            streamWatchdog.schedule(
                {
                    timedOut.set(true)
                    runCatching { stream.close() }
                },
                remainingMs,
                TimeUnit.MILLISECONDS,
            )

        val sb = StringBuilder()
        var usage: Usage? = null
        var streamFinishReason = ""
        var streamSawReasoning = false
        var streamReasoningTokens = 0
        var streamFailedMessage: String? = null
        try {
            stream.use { input ->
                BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8)).use { reader ->
                    while (true) {
                        token.throwIfCancelled()
                        if (timedOut.get()) throw TimeoutException("timed out after ${timeoutMs}ms")
                        val line = reader.readLine() ?: break
                        token.throwIfCancelled()
                        if (timedOut.get()) throw TimeoutException("timed out after ${timeoutMs}ms")
                        val trimmed = line.trim()
                        if (trimmed.isEmpty() || !trimmed.startsWith("data:")) continue
                        val data = trimmed.removePrefix("data:").trim()
                        if (data == "[DONE]") break
                        val chunk = runCatching { Json.parseObject(data) }.getOrNull() ?: continue
                        val eventType = chunk["type"]?.toString()?.lowercase().orEmpty()
                        parseUsageFromMap(chunk)?.let { usage = it }
                        val chunkReasoning = extractReasoningTokensFromMap(chunk)
                        if (chunkReasoning > streamReasoningTokens) streamReasoningTokens = chunkReasoning
                        if (chunkHasReasoningContent(chunk)) streamSawReasoning = true
                        extractFinishReasonFromMap(chunk).takeIf { it.isNotEmpty() }?.let { streamFinishReason = it }
                        if (eventType == "response.failed" || eventType == "error") {
                            val respObj = chunk["response"] as? Map<*, *>
                            val errObj = (respObj?.get("error") as? Map<*, *>) ?: (chunk["error"] as? Map<*, *>)
                            streamFailedMessage =
                                errObj?.get("message")?.toString()?.trim()?.takeIf { it.isNotEmpty() }
                                    ?: "response stream failed"
                            break
                        }
                        val delta = parseStreamDeltaFromMap(wire, chunk)
                        if (delta.isNotEmpty()) {
                            sb.append(delta)
                            if (stopAtNewline) {
                                val firstNonWs = sb.indexOfFirst { !it.isWhitespace() }
                                if (firstNonWs >= 0) {
                                    val nlAfter = sb.indexOf('\n', startIndex = firstNonWs)
                                    if (nlAfter >= 0) {
                                        val end = if (nlAfter > 0 && sb[nlAfter - 1] == '\r') nlAfter - 1 else nlAfter
                                        sb.setLength(end)
                                        break
                                    }
                                }
                            }
                        }
                        if (eventType == "response.completed" || eventType == "response.incomplete") {
                            if (sb.isEmpty()) {
                                val respObj = chunk["response"] as? Map<*, *>
                                if (respObj != null) {
                                    val fallbackText = extractResponsesApiText(respObj.entries.associate { it.key.toString() to it.value })
                                    if (fallbackText.isNotEmpty()) sb.append(fallbackText)
                                }
                            }
                            break
                        }
                    }
                }
            }
        } catch (e: Exception) {
            if (token.isCancelled() || e is CancelledException) throw CancelledException()
            val detail =
                if (timedOut.get()) {
                    "timed out after ${timeoutMs}ms"
                } else {
                    SecretRedactor.redactText(formatTransportError(rootCause(e), e, timeoutMs), config.apiKey)
                }
            emitFailure(request.method(), safeUrl, template, started, null, detail)
            throw RuntimeException("${request.method()} $safeUrl failed: $detail", e)
        } finally {
            watchdog.cancel(false)
        }

        if (token.isCancelled()) throw CancelledException()
        if (timedOut.get()) {
            val detail = "timed out after ${timeoutMs}ms"
            emitFailure(request.method(), safeUrl, template, started, null, detail)
            throw RuntimeException("${request.method()} $safeUrl failed: $detail")
        }
        if (streamFailedMessage != null) {
            val safeError = SecretRedactor.redactText(streamFailedMessage!!, config.apiKey)
            emitFailure(request.method(), safeUrl, template, started, status, safeError)
            throw HttpStatusException(status, "${request.method()} $safeUrl -> HTTP $status: $safeError")
        }

        val text = sb.toString()
        val emptyReason =
            if (text.isBlank()) {
                formatEmptyDiagnostic(
                    finishReason = streamFinishReason,
                    reasoningConsumed = streamSawReasoning || streamReasoningTokens > 0,
                    reasoningTokens = streamReasoningTokens,
                    refusal = "",
                )
            } else {
                null
            }
        emitSuccess(request.method(), safeUrl, template, started, status, null, text.length, emptyReason)
        return ProviderResponse(text = text, usage = usage, rawStatus = status, emptyReason = emptyReason)
    }

    private fun pathFor(
        template: PromptTemplate,
        cfg: ProviderConfig,
    ): String = resolvePath(template, cfg)

    private fun bodyFor(
        template: PromptTemplate,
        request: ProviderRequest,
        cfg: ProviderConfig,
        stream: Boolean,
    ): String {
        val model = request.model.ifBlank { cfg.model }
        val maxTokens = request.maxTokens.coerceAtLeast(1)
        val customStops = parseStopSequences(cfg.stopSequences)
        val combinedStops = (template.stopTokens() + customStops).distinct()
        val payload = LinkedHashMap<String, Any?>()

        when (template.wireFormat()) {
            WireFormat.FIM_FIELDS -> {
                payload["model"] = model
                payload["prompt"] = request.prefix
                payload["suffix"] = request.suffix
                payload["max_tokens"] = maxTokens
                payload["temperature"] = request.temperature
                payload["stream"] = stream
                if (combinedStops.isNotEmpty()) payload["stop"] = combinedStops
            }
            WireFormat.COMPLETION_PROMPT -> {
                val prompt = template.formatTokenPrompt(request.prefix, request.suffix)
                payload["model"] = model
                payload["prompt"] = prompt
                payload["max_tokens"] = maxTokens
                payload["temperature"] = request.temperature
                payload["stream"] = stream
                if (combinedStops.isNotEmpty()) payload["stop"] = combinedStops
            }
            WireFormat.CHAT_MESSAGES -> {
                val messages =
                    listOf(
                        mapOf(
                            "role" to "system",
                            "content" to PromptBuilder.STRICT_COMPLETION_INSTRUCTIONS,
                        ),
                        mapOf(
                            "role" to "user",
                            "content" to
                                PromptBuilder.chatUserContent(
                                    prefix = request.prefix,
                                    suffix = request.suffix,
                                    path = request.path,
                                    language = request.language,
                                    recentSnippets = request.recentSnippets,
                                    embedRules = false,
                                ),
                        ),
                    )
                payload["model"] = model
                payload["messages"] = messages
                payload["max_tokens"] = maxTokens
                payload["temperature"] = request.temperature
                payload["stream"] = stream
                if (combinedStops.isNotEmpty()) payload["stop"] = combinedStops
            }
            WireFormat.RESPONSES_API -> {
                payload["model"] = model
                payload["instructions"] = PromptBuilder.STRICT_COMPLETION_INSTRUCTIONS
                // Embed the strict completion rules inside `input` as well so proxies that override
                // top-level `instructions` (e.g. Codex OAuth gateways) still enforce strict FIM output.
                payload["input"] =
                    PromptBuilder.chatUserContent(
                        prefix = request.prefix,
                        suffix = request.suffix,
                        path = request.path,
                        language = request.language,
                        recentSnippets = request.recentSnippets,
                        embedRules = true,
                    )
                payload["max_output_tokens"] = maxTokens
                payload["store"] = false
                payload["stream"] = stream
                // Omit default temperature=0 and stop on Responses API: OpenAI reasoning models
                // reject temperature when effort != none and /responses does not support top-level stop.
                if (request.temperature > 0.0) {
                    payload["temperature"] = request.temperature
                }
            }
        }

        mergeExtraBody(payload, cfg.extraBodyJson, allowStop = template.wireFormat() != WireFormat.RESPONSES_API)
        return Json.obj(*payload.entries.map { it.key to it.value }.toTypedArray())
    }

    private fun mergeExtraBody(
        target: MutableMap<String, Any?>,
        extraBodyJson: String,
        allowStop: Boolean = true,
    ) {
        if (extraBodyJson.isBlank()) return
        val extra = runCatching { Json.parseObject(extraBodyJson) }.getOrNull() ?: return
        for ((key, value) in extra) {
            if (key in PROTECTED_BODY_KEYS) continue
            if (key == "stop") {
                if (!allowStop) continue
                if (target.containsKey("stop")) {
                    val existing = (target["stop"] as? List<*>)?.mapNotNull { it?.toString() }.orEmpty()
                    val added =
                        when (value) {
                            is List<*> -> value.mapNotNull { it?.toString() }.filter { it.isNotEmpty() }
                            is String -> if (value.isNotEmpty()) listOf(value) else emptyList()
                            else -> emptyList()
                        }
                    val merged = (existing + added).distinct()
                    if (merged.isNotEmpty()) target["stop"] = merged
                    continue
                }
            }
            target[key] = value
        }
    }

    private fun parseText(
        wire: WireFormat,
        body: String,
    ): String {
        val json = runCatching { Json.parseObject(body) }.getOrNull() ?: return ""
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        val extracted =
            when (wire) {
                WireFormat.RESPONSES_API ->
                    extractResponsesApiText(json)
                        .ifEmpty {
                            val msg = first?.get("message") as? Map<*, *>
                            extractTextValue(msg?.get("content"))
                        }.ifEmpty { extractTextValue(first?.get("text")) }
                WireFormat.FIM_FIELDS, WireFormat.COMPLETION_PROMPT -> {
                    extractTextValue(first?.get("text"))
                        .ifEmpty {
                            val msg = first?.get("message") as? Map<*, *>
                            extractTextValue(msg?.get("content"))
                        }.ifEmpty { extractTextValue(json["text"]) }
                }
                WireFormat.CHAT_MESSAGES -> {
                    val msg = first?.get("message") as? Map<*, *>
                    extractTextValue(msg?.get("content"))
                        .ifEmpty { extractTextValue(first?.get("text")) }
                }
            }
        if (extracted.isNotEmpty()) return extracted
        return extractResponsesApiText(json)
    }

    private fun extractTextValue(raw: Any?): String =
        when (raw) {
            null -> ""
            is String -> raw
            is List<*> ->
                buildString {
                    for (part in raw) {
                        when (part) {
                            is String -> append(part)
                            is Map<*, *> -> {
                                val type = part["type"]?.toString()?.lowercase().orEmpty()
                                if (type.isNotEmpty() && type !in setOf("text", "output_text", "input_text")) {
                                    continue
                                }
                                val piece = part["text"]?.toString().orEmpty()
                                if (piece.isNotEmpty()) append(piece)
                            }
                        }
                    }
                }
            else -> ""
        }

    private fun extractResponsesApiText(json: Map<String, Any?>): String {
        val direct = extractTextValue(json["output_text"])
        if (direct.isNotEmpty()) return direct
        val output = json["output"] as? List<*> ?: return ""
        return buildString {
            for (item in output) {
                val map = item as? Map<*, *> ?: continue
                val type = map["type"]?.toString()?.lowercase().orEmpty()
                if (type == "reasoning") continue
                val piece = extractTextValue(map["content"]).ifEmpty { extractTextValue(map["text"]) }
                if (piece.isNotEmpty()) append(piece)
            }
        }
    }

    private fun diagnoseEmptyResponse(body: String): String {
        val json = runCatching { Json.parseObject(body) }.getOrNull() ?: return "empty completion"
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        val msg = first?.get("message") as? Map<*, *>
        val refusal = msg?.get("refusal")?.toString()?.trim().orEmpty()
        val finishReason = extractFinishReasonFromMap(json)
        val hasReasoningText = chunkHasReasoningContent(json)
        val reasoningTokens = extractReasoningTokensFromMap(json)
        return formatEmptyDiagnostic(
            finishReason = finishReason,
            reasoningConsumed = hasReasoningText || reasoningTokens > 0,
            reasoningTokens = reasoningTokens,
            refusal = refusal,
        )
    }

    private fun extractFinishReasonFromMap(json: Map<String, Any?>): String {
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        val respObj = json["response"] as? Map<*, *>
        val incomplete = (respObj?.get("incomplete_details") as? Map<*, *>) ?: (json["incomplete_details"] as? Map<*, *>)
        return first?.get("finish_reason")?.toString()?.trim().orEmpty()
            .ifEmpty { incomplete?.get("reason")?.toString()?.trim().orEmpty() }
            .ifEmpty {
                val st = (respObj?.get("status") ?: json["status"])?.toString()?.trim().orEmpty()
                if (st == "incomplete") st else ""
            }
    }

    private fun chunkHasReasoningContent(json: Map<String, Any?>): Boolean {
        val eventType = json["type"]?.toString()?.lowercase().orEmpty()
        if (eventType.contains("reasoning")) return true
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        val msg = first?.get("message") as? Map<*, *>
        val delta = first?.get("delta") as? Map<*, *>
        return listOf(
            msg?.get("reasoning_content"),
            msg?.get("reasoning"),
            delta?.get("reasoning_content"),
            delta?.get("reasoning"),
            first?.get("reasoning"),
        ).any { it is String && it.isNotBlank() }
    }

    private fun extractReasoningTokensFromMap(json: Map<String, Any?>): Int {
        val respObj = json["response"] as? Map<*, *>
        val usage = (respObj?.get("usage") as? Map<*, *>) ?: (json["usage"] as? Map<*, *>) ?: return 0
        val completionDetails =
            (usage["completion_tokens_details"] as? Map<*, *>)
                ?: (usage["output_tokens_details"] as? Map<*, *>)
        return (completionDetails?.get("reasoning_tokens") as? Number)?.toInt() ?: 0
    }

    private fun formatEmptyDiagnostic(
        finishReason: String,
        reasoningConsumed: Boolean,
        reasoningTokens: Int,
        refusal: String,
    ): String {
        if (refusal.isNotEmpty()) {
            return "empty completion (refusal: ${refusal.take(120)})"
        }
        return when {
            reasoningConsumed -> {
                val meta =
                    buildList {
                        if (finishReason.isNotEmpty()) add("finish_reason=$finishReason")
                        if (reasoningTokens > 0) add("reasoning_tokens=$reasoningTokens")
                    }.joinToString(", ")
                val prefix = if (meta.isNotEmpty()) "$meta; " else ""
                "empty completion (${prefix}reasoning consumed output budget — increase maxTokens or disable reasoning in extraBodyJson)"
            }
            finishReason == "length" || finishReason == "max_output_tokens" ->
                "empty completion (finish_reason=$finishReason — increase maxTokens)"
            finishReason.isNotEmpty() && finishReason != "stop" ->
                "empty completion (finish_reason=$finishReason)"
            else -> "empty completion"
        }
    }

    private fun parseStreamDelta(
        wire: WireFormat,
        data: String,
    ): String {
        val json = runCatching { Json.parseObject(data) }.getOrNull() ?: return ""
        return parseStreamDeltaFromMap(wire, json)
    }

    private fun parseStreamDeltaFromMap(
        wire: WireFormat,
        json: Map<String, Any?>,
    ): String {
        val eventType = json["type"]?.toString()?.lowercase().orEmpty()
        if (eventType == "response.output_text.delta") {
            return extractTextValue(json["delta"])
        }
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        if (first != null) {
            return when (wire) {
                WireFormat.FIM_FIELDS, WireFormat.COMPLETION_PROMPT ->
                    extractTextValue(first["text"])
                        .ifEmpty {
                            val delta = first["delta"] as? Map<*, *>
                            extractTextValue(delta?.get("content"))
                        }
                WireFormat.CHAT_MESSAGES, WireFormat.RESPONSES_API -> {
                    val delta = first["delta"] as? Map<*, *>
                    extractTextValue(delta?.get("content"))
                        .ifEmpty { extractTextValue(first["text"]) }
                }
            }
        }
        return ""
    }

    private fun parseUsage(body: String): Usage? {
        val json = runCatching { Json.parseObject(body) }.getOrNull() ?: return null
        return parseUsageFromMap(json)
    }

    private fun parseUsageFromMap(json: Map<String, Any?>): Usage? {
        val respObj = json["response"] as? Map<*, *>
        val usage = (respObj?.get("usage") as? Map<*, *>) ?: (json["usage"] as? Map<*, *>) ?: return null
        val input = ((usage["prompt_tokens"] ?: usage["input_tokens"]) as? Number)?.toInt()
        val output = ((usage["completion_tokens"] ?: usage["output_tokens"]) as? Number)?.toInt()
        if (input == null && output == null) return null
        return Usage(inputTokens = input, outputTokens = output)
    }

    private fun parseModels(body: String): List<RemoteModel> {
        val json = Json.parseObject(body)
        val raw = (json["data"] as? List<*>) ?: (json["models"] as? List<*>) ?: emptyList<Any?>()
        return raw
            .mapNotNull { item ->
                when (item) {
                    is String -> RemoteModel(id = item)
                    is Map<*, *> -> {
                        val id =
                            sequenceOf("id", "name", "model")
                                .mapNotNull { key -> item[key]?.toString()?.trim() }
                                .firstOrNull { it.isNotEmpty() }
                                ?: return@mapNotNull null
                        RemoteModel(id = id, contextLength = ModelLimits.contextTokensFromModelObject(item))
                    }
                    else -> null
                }
            }.distinctBy { it.id }
            .sortedBy { it.id }
    }

    private fun applyAuth(
        builder: HttpRequest.Builder,
        cfg: ProviderConfig,
    ) {
        val key = cfg.apiKey.trim()
        if (key.isEmpty()) return
        val template = cfg.authHeaderTemplate.ifBlank { "Authorization: Bearer \${apiKey}" }
        val rendered = template.replace("\${apiKey}", key).replace("{{apiKey}}", key)
        if (SettingsValidation.containsCrlfOrNul(rendered)) return
        val idx = rendered.indexOf(':')
        if (idx <= 0) {
            if (SettingsValidation.isValidHeaderValue(rendered)) {
                builder.header("Authorization", rendered)
            }
            return
        }
        val name = rendered.substring(0, idx).trim()
        val value = rendered.substring(idx + 1).trim()
        if (SettingsValidation.isValidHeaderName(name) && value.isNotEmpty() && SettingsValidation.isValidHeaderValue(value)) {
            builder.header(name, value)
        }
    }

    private fun applyExtraHeaders(
        builder: HttpRequest.Builder,
        json: String,
    ) {
        if (json.isBlank()) return
        val obj = runCatching { Json.parseObject(json) }.getOrNull() ?: return
        for ((key, value) in obj) {
            val trimmedKey = key.trim()
            val text = value?.toString()?.trim() ?: continue
            if (trimmedKey.isEmpty() || text.isEmpty()) continue
            if (!SettingsValidation.isValidHeaderName(trimmedKey)) continue
            if (!SettingsValidation.isValidHeaderValue(text)) continue
            if (SettingsValidation.isBlockedExtraHeader(trimmedKey)) continue
            runCatching { builder.header(trimmedKey, text) }
        }
    }

    private fun emitSuccess(
        method: String,
        safeUrl: String,
        template: PromptTemplate,
        started: Long,
        status: Int,
        rawResponseChars: Int?,
        completionChars: Int,
        emptyReason: String? = null,
    ) {
        val reasonSuffix = if (!emptyReason.isNullOrBlank()) " detail=$emptyReason" else ""
        emitLog(
            HttpLogEvent(
                level = LogLevel.INFO,
                operation = operation,
                method = method,
                url = safeUrl,
                model = config.model,
                requestStyle = template.name,
                status = status,
                latencyMs = System.currentTimeMillis() - started,
                responseChars = rawResponseChars,
                message = "request succeeded completionChars=$completionChars template=${template.shortLabel()}$reasonSuffix",
            ),
        )
    }

    private fun emitFailure(
        method: String,
        safeUrl: String,
        template: PromptTemplate,
        started: Long,
        status: Int?,
        error: String,
        responseChars: Int? = null,
    ) {
        emitLog(
            HttpLogEvent(
                level = if (status in setOf(401, 403)) LogLevel.ERROR else LogLevel.WARN,
                operation = operation,
                method = method,
                url = safeUrl,
                model = config.model,
                requestStyle = template.name,
                status = status,
                latencyMs = System.currentTimeMillis() - started,
                responseChars = responseChars,
                error = error,
                message = "request failed template=${template.shortLabel()}",
            ),
        )
    }

    private fun emitLog(event: HttpLogEvent) {
        runCatching { onLog(event) }
    }

    private fun rootCause(error: Throwable): Throwable {
        var current = error
        while (current.cause != null && current.cause !== current) current = current.cause!!
        return current
    }

    private fun completionTimeoutMs(): Int =
        config.timeoutMs.coerceIn(ProviderConfig.MIN_TIMEOUT_MS, ProviderConfig.MAX_TIMEOUT_MS)

    private fun settingsTimeoutMs(): Int =
        config.settingsTimeoutMs.coerceIn(ProviderConfig.MIN_SETTINGS_TIMEOUT_MS, ProviderConfig.MAX_SETTINGS_TIMEOUT_MS)

    private fun formatTransportError(
        cause: Throwable,
        fallback: Throwable,
        timeoutMs: Int,
    ): String =
        when {
            cause is TimeoutException ||
                cause is HttpTimeoutException ||
                cause.message.orEmpty().contains("timed out", ignoreCase = true) ||
                fallback.message.orEmpty().contains("timed out", ignoreCase = true) ||
                fallback.message.orEmpty().contains("TimeoutException") ->
                "timed out after ${timeoutMs}ms"
            else ->
                cause.message.orEmpty().ifBlank {
                    fallback.message.orEmpty().ifBlank { cause.javaClass.simpleName }
                }
        }

    private fun isSettingsOperation(op: String): Boolean =
        op in
            setOf(
                "connection_test",
                "list_models",
                "template_probe",
                "template_probe_all",
                "format_test",
            )

    companion object {
        private val PROTECTED_BODY_KEYS =
            setOf("model", "prompt", "suffix", "messages", "input", "instructions", "stream")

        private fun httpStatusFallbackMessage(status: Int): String =
            when (status) {
                400 -> "Bad Request"
                401 -> "Unauthorized"
                403 -> "Forbidden"
                404 -> "Not Found"
                405 -> "Method Not Allowed"
                429 -> "Too Many Requests"
                500 -> "Internal Server Error"
                502 -> "Bad Gateway"
                503 -> "Service Unavailable"
                504 -> "Gateway Timeout"
                else -> "HTTP $status (empty response body)"
            }

        private val sharedDefaultClient: HttpClient by lazy { createDefaultHttpClient() }

        private val streamWatchdog: ScheduledExecutorService =
            Executors.newSingleThreadScheduledExecutor { r ->
                Thread(r, "auto-complete-stream-watchdog").apply { isDaemon = true }
            }

        fun sharedDefaultHttpClient(): HttpClient = sharedDefaultClient

        fun createDefaultHttpClient(connectTimeoutMs: Long = 10_000L): HttpClient =
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs.coerceIn(500L, 60_000L)))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build()

        fun resolvePath(
            template: PromptTemplate,
            cfg: ProviderConfig,
        ): String =
            when (template.wireFormat()) {
                WireFormat.FIM_FIELDS -> {
                    val custom = cfg.fimPath.trim()
                    when {
                        custom.isNotEmpty() -> custom
                        PromptTemplateDetector.isDeepSeekBetaUrl(cfg.baseUrl) ->
                            defaultOpenAiRelativePath(cfg.baseUrl, "/completions")
                        else -> defaultOpenAiRelativePath(cfg.baseUrl, "/fim/completions")
                    }
                }
                WireFormat.COMPLETION_PROMPT -> {
                    val customComp = cfg.completionsPath.trim()
                    val customFim = cfg.fimPath.trim()
                    when {
                        customComp.isNotEmpty() -> customComp
                        customFim.isNotEmpty() && !isChatEndpointPath(customFim) -> customFim
                        else -> defaultOpenAiRelativePath(cfg.baseUrl, "/completions")
                    }
                }
                WireFormat.CHAT_MESSAGES -> {
                    val custom = cfg.chatPath.trim()
                    if (custom.isNotEmpty()) custom else defaultOpenAiRelativePath(cfg.baseUrl, "/chat/completions")
                }
                WireFormat.RESPONSES_API -> {
                    val custom = cfg.responsesPath.trim()
                    if (custom.isNotEmpty()) custom else defaultOpenAiRelativePath(cfg.baseUrl, "/responses")
                }
            }

        fun isChatEndpointPath(path: String): Boolean {
            val clean = path.trim().substringBefore('?').trimEnd('/').lowercase()
            return clean == "/chat/completions" || clean.endsWith("/chat/completions")
        }

        fun resolveUrl(
            template: PromptTemplate,
            cfg: ProviderConfig,
        ): String = joinUrl(cfg.baseUrl, resolvePath(template, cfg))

        fun resolveTemplate(cfg: ProviderConfig): PromptTemplate {
            val stored =
                if (cfg.promptTemplate != PromptTemplate.AUTO) {
                    cfg.promptTemplate
                } else {
                    // Backward compat: honor explicit legacy requestStyle when template is AUTO.
                    when (cfg.requestStyle) {
                        RequestStyle.FIM -> PromptTemplate.CODESTRAL_API
                        RequestStyle.CHAT -> PromptTemplate.CHAT
                        RequestStyle.AUTO -> PromptTemplate.AUTO
                    }
                }
            return PromptTemplateDetector.resolve(stored, cfg.model, cfg.kind, cfg.baseUrl)
        }

        fun parseStopSequences(raw: String): List<String> {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return emptyList()
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                val arr = runCatching { Json.parseArray(trimmed) }.getOrNull()
                if (arr != null) {
                    return arr.mapNotNull { (it as? String)?.takeIf { s -> s.isNotEmpty() } }.distinct()
                }
            }
            val parts =
                if (trimmed.contains('\n') || trimmed.contains('\r')) {
                    trimmed.split(Regex("""\r?\n"""))
                } else {
                    trimmed.split(',')
                }
            return parts
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .distinct()
        }

        fun joinUrl(
            base: String,
            path: String,
        ): String {
            val b = base.trim()
            val rawPath = path.trim()
            val p = if (rawPath.startsWith("/")) rawPath else "/$rawPath"
            val uri = runCatching { URI.create(b) }.getOrNull()
            if (uri == null || uri.scheme.isNullOrBlank() || uri.rawAuthority.isNullOrBlank()) {
                return b.trimEnd('/') + p
            }
            val pQueryIdx = p.indexOf('?')
            val pPath = if (pQueryIdx >= 0) p.substring(0, pQueryIdx) else p
            val pQuery = if (pQueryIdx >= 0) p.substring(pQueryIdx + 1) else null
            val basePath = (uri.rawPath ?: "").trimEnd('/')
            val combinedPath = basePath + pPath
            val baseQuery = uri.rawQuery
            val combinedQuery =
                listOfNotNull(
                    baseQuery?.takeIf { it.isNotEmpty() },
                    pQuery?.takeIf { it.isNotEmpty() },
                ).joinToString("&")
            val fragment = uri.rawFragment?.let { "#$it" }.orEmpty()
            val queryPart = if (combinedQuery.isNotEmpty()) "?$combinedQuery" else ""
            return "${uri.scheme}://${uri.rawAuthority}$combinedPath$queryPart$fragment"
        }

        /**
         * OpenAI-compatible relative path resolution:
         * - Only prepend `/v1` when `baseUrl` has an empty path (`""` or `"/"`).
         * - Keep any non-empty path prefix (`/v1`, `/beta`, `/v2`, `/openai/v1beta`, etc.) intact.
         */
        fun defaultOpenAiRelativePath(
            baseUrl: String,
            v1Suffix: String,
        ): String {
            val suffix = if (v1Suffix.startsWith("/")) v1Suffix else "/$v1Suffix"
            val basePath = runCatching { URI.create(baseUrl.trim()).path.orEmpty().trimEnd('/') }.getOrDefault("")
            return if (basePath.isEmpty()) "/v1$suffix" else suffix
        }

        private fun modelPaths(baseUrl: String): List<String> {
            val path = runCatching { URI.create(baseUrl.trim()).path.orEmpty().trimEnd('/') }.getOrDefault("")
            return if (path.endsWith("/v1")) listOf("/models") else listOf("/models", "/v1/models")
        }

        fun validateBaseUrl(
            baseUrl: String,
            allowRemote: Boolean,
        ) {
            val trimmed = baseUrl.trim()
            val safe = SecretRedactor.redactUrl(trimmed)
            val uri =
                runCatching { URI.create(trimmed) }
                    .getOrElse { throw IllegalArgumentException("Invalid baseUrl: $safe") }
            val scheme = uri.scheme?.lowercase()
            if (scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
                throw IllegalArgumentException("Invalid baseUrl: $safe")
            }
            if (scheme != "http" && scheme != "https") {
                throw IllegalArgumentException("Invalid baseUrl scheme (must be http or https): $safe")
            }
            if (!uri.userInfo.isNullOrBlank()) {
                throw IllegalArgumentException("baseUrl must not contain user-info credentials: $safe")
            }
            if (!allowRemote && !SettingsValidation.isLocalHost(uri.host)) {
                throw IllegalArgumentException("Remote baseUrl blocked by allowRemote=false: $safe")
            }
        }
    }
}
