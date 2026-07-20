package io.autocomplete.client

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
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException
import java.time.Duration
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
)

data class ProviderResponse(
    val text: String,
    val usage: Usage? = null,
    val rawStatus: Int? = null,
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
    val requestStyle: RequestStyle = RequestStyle.AUTO,
    /** Stored template id; [PromptTemplate.AUTO] resolves from model name. */
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
    private val http: HttpClient = createDefaultHttpClient(),
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
        val body = bodyFor(template, request, config, useStream)
        val settingsOp = isSettingsOperation(operation)
        emitLog(
            HttpLogEvent(
                // Settings probes must be visible at default info log level.
                level = if (settingsOp) LogLevel.INFO else LogLevel.DEBUG,
                operation = operation,
                method = "POST",
                url = url,
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
        applyAuth(builder, config)
        applyExtraHeaders(builder, config.extraHeadersJson)
        token.throwIfCancelled()
        val httpRequest = builder.build()
        return if (useStream) {
            completeStreaming(httpRequest, wire, template, token, hardTimeout)
        } else {
            completeBlocking(httpRequest, wire, template, token, hardTimeout)
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
                    error = "empty completion",
                )
            } else {
                TemplateProbeResult(
                    template = concrete,
                    status = TemplateProbeStatus.SUCCESS,
                    httpStatus = resp.rawStatus,
                    latencyMs = latency,
                    preview = preview,
                    resolvedPath = path,
                )
            }
        } catch (e: Exception) {
            val status = (e as? HttpStatusException)?.status
            TemplateProbeResult(
                template = concrete,
                status = TemplateProbeStatus.FAILED,
                httpStatus = status,
                latencyMs = System.currentTimeMillis() - started,
                error = e.message.orEmpty().ifBlank { e.javaClass.simpleName },
                resolvedPath = path,
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
            maxTokens = minOf(config.maxTokens, 16),
            temperature = 0.0,
            stream = false,
        )

    fun listModels(): List<RemoteModel> {
        validateBaseUrl(config.baseUrl, config.allowRemote)
        val hardTimeout = settingsTimeoutMs()
        val paths = modelPaths(config.baseUrl)
        var lastFailure: RuntimeException? = null
        for (path in paths) {
            val url = joinUrl(config.baseUrl, path)
            val started = System.currentTimeMillis()
            emitLog(
                HttpLogEvent(
                    level = LogLevel.INFO,
                    operation = "list_models",
                    method = "GET",
                    url = url,
                    message = "request start timeoutMs=$hardTimeout",
                ),
            )
            val builder =
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofMillis(hardTimeout.toLong()))
                    .header("Accept", "application/json")
                    .GET()
            applyAuth(builder, config)
            applyExtraHeaders(builder, config.extraHeadersJson)
            val future = http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString())
            val response =
                try {
                    future
                        .orTimeout(hardTimeout.toLong(), TimeUnit.MILLISECONDS)
                        .join()
                } catch (e: Exception) {
                    future.cancel(true)
                    val cause = rootCause(e)
                    val detail = formatTransportError(cause, e, hardTimeout)
                    emitLog(
                        HttpLogEvent(
                            level = LogLevel.WARN,
                            operation = "list_models",
                            method = "GET",
                            url = url,
                            latencyMs = System.currentTimeMillis() - started,
                            error = detail,
                            message = "request failed",
                        ),
                    )
                    throw RuntimeException("GET $url failed: $detail", cause)
                }
            if (response.statusCode() in 200..299) {
                val models = parseModels(response.body())
                emitLog(
                    HttpLogEvent(
                        level = LogLevel.INFO,
                        operation = "list_models",
                        method = "GET",
                        url = url,
                        status = response.statusCode(),
                        latencyMs = System.currentTimeMillis() - started,
                        responseChars = response.body().length,
                        message = "models=${models.size} withContext=${models.count { it.contextLength != null }}",
                    ),
                )
                return models
            }
            val failure =
                HttpStatusException(
                    response.statusCode(),
                    "GET $url -> HTTP ${response.statusCode()}: ${response.body().take(300)}",
                )
            emitLog(
                HttpLogEvent(
                    level = if (response.statusCode() in setOf(401, 403)) LogLevel.ERROR else LogLevel.WARN,
                    operation = "list_models",
                    method = "GET",
                    url = url,
                    status = response.statusCode(),
                    latencyMs = System.currentTimeMillis() - started,
                    responseChars = response.body().length,
                    error = response.body().take(300),
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
                val detail = formatTransportError(cause, e, timeoutMs)
                emitFailure(request, template, started, null, detail)
                throw RuntimeException("${request.method()} ${request.uri()} failed: $detail", e)
            }
        token.throwIfCancelled()
        val status = response.statusCode()
        if (status !in 200..299) {
            emitFailure(request, template, started, status, response.body().take(300), response.body().length)
            throw HttpStatusException(
                status,
                "${request.method()} ${request.uri()} -> HTTP $status: ${response.body().take(300)}",
            )
        }
        val text = parseText(wire, response.body())
        val usage = parseUsage(response.body())
        emitSuccess(request, template, started, status, response.body().length, text.length)
        return ProviderResponse(text = text, usage = usage, rawStatus = status)
    }

    private fun completeStreaming(
        request: HttpRequest,
        wire: WireFormat,
        template: PromptTemplate,
        token: CancellationToken,
        timeoutMs: Int,
    ): ProviderResponse {
        val started = System.currentTimeMillis()
        val response =
            try {
                val future = http.sendAsync(request, HttpResponse.BodyHandlers.ofLines())
                token.onCancel { future.cancel(true) }
                future.orTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS).join()
            } catch (e: Exception) {
                if (token.isCancelled() || e is InterruptedException || e.cause is InterruptedException) {
                    throw CancelledException()
                }
                val cause = rootCause(e)
                val detail = formatTransportError(cause, e, timeoutMs)
                emitFailure(request, template, started, null, detail)
                throw RuntimeException("${request.method()} ${request.uri()} failed: $detail", e)
            }
        token.throwIfCancelled()
        val status = response.statusCode()
        if (status !in 200..299) {
            emitFailure(request, template, started, status, "stream failed")
            throw HttpStatusException(status, "${request.method()} ${request.uri()} -> HTTP $status: stream failed")
        }
        val sb = StringBuilder()
        try {
            response.body().forEach { line ->
                token.throwIfCancelled()
                val trimmed = line.trim()
                if (trimmed.isEmpty() || !trimmed.startsWith("data:")) return@forEach
                val data = trimmed.removePrefix("data:").trim()
                if (data == "[DONE]") return@forEach
                sb.append(parseStreamDelta(wire, data))
            }
        } catch (e: Exception) {
            if (token.isCancelled() || e is CancelledException) throw CancelledException()
            throw e
        }
        val text = sb.toString()
        emitSuccess(request, template, started, status, null, text.length)
        return ProviderResponse(text = text, rawStatus = status)
    }

    private fun resolveTemplate(cfg: ProviderConfig): PromptTemplate {
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
        return PromptTemplateDetector.resolve(stored, cfg.model, cfg.kind)
    }

    private fun pathFor(
        template: PromptTemplate,
        cfg: ProviderConfig,
    ): String =
        when (template.wireFormat()) {
            // OpenAI-compatible FIM: always resolves to {host}/v1/fim/completions
            // (baseUrl may already end with /v1, or be the bare host root).
            WireFormat.FIM_FIELDS ->
                cfg.fimPath.ifBlank { defaultOpenAiRelativePath(cfg.baseUrl, "/fim/completions") }
            WireFormat.COMPLETION_PROMPT ->
                cfg.completionsPath.ifBlank {
                    cfg.fimPath.ifBlank { defaultOpenAiRelativePath(cfg.baseUrl, "/completions") }
                }
            WireFormat.CHAT_MESSAGES ->
                cfg.chatPath.ifBlank { defaultOpenAiRelativePath(cfg.baseUrl, "/chat/completions") }
        }

    private fun bodyFor(
        template: PromptTemplate,
        request: ProviderRequest,
        cfg: ProviderConfig,
        stream: Boolean,
    ): String {
        val model = request.model.ifBlank { cfg.model }
        val maxTokens = request.maxTokens.coerceAtLeast(1)
        return when (template.wireFormat()) {
            WireFormat.FIM_FIELDS ->
                Json.obj(
                    "model" to model,
                    "prompt" to request.prefix,
                    "suffix" to request.suffix,
                    "max_tokens" to maxTokens,
                    "temperature" to request.temperature,
                    "stream" to stream,
                )
            WireFormat.COMPLETION_PROMPT -> {
                val prompt = template.formatTokenPrompt(request.prefix, request.suffix)
                val stops = template.stopTokens()
                if (stops.isEmpty()) {
                    Json.obj(
                        "model" to model,
                        "prompt" to prompt,
                        "max_tokens" to maxTokens,
                        "temperature" to request.temperature,
                        "stream" to stream,
                    )
                } else {
                    Json.obj(
                        "model" to model,
                        "prompt" to prompt,
                        "max_tokens" to maxTokens,
                        "temperature" to request.temperature,
                        "stream" to stream,
                        "stop" to stops,
                    )
                }
            }
            WireFormat.CHAT_MESSAGES -> {
                val messages =
                    listOf(
                        mapOf(
                            "role" to "system",
                            "content" to
                                "You are a code completion engine. Continue the code at the cursor. Output only the completion text, no markdown.",
                        ),
                        mapOf(
                            "role" to "user",
                            "content" to PromptBuilder.chatUserContent(request.prefix, request.suffix),
                        ),
                    )
                Json.obj(
                    "model" to model,
                    "messages" to messages,
                    "max_tokens" to maxTokens,
                    "temperature" to request.temperature,
                    "stream" to stream,
                )
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseText(
        wire: WireFormat,
        body: String,
    ): String {
        val json = runCatching { Json.parseObject(body) }.getOrNull() ?: return ""
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *>
        return when (wire) {
            WireFormat.FIM_FIELDS, WireFormat.COMPLETION_PROMPT -> {
                first?.get("text")?.toString().orEmpty()
                    .ifBlank {
                        val msg = first?.get("message") as? Map<*, *>
                        msg?.get("content")?.toString().orEmpty()
                    }.ifBlank { json["text"]?.toString().orEmpty() }
            }
            WireFormat.CHAT_MESSAGES -> {
                val msg = first?.get("message") as? Map<*, *>
                msg?.get("content")?.toString().orEmpty()
                    .ifBlank { first?.get("text")?.toString().orEmpty() }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseStreamDelta(
        wire: WireFormat,
        data: String,
    ): String {
        val json = runCatching { Json.parseObject(data) }.getOrNull() ?: return ""
        val choices = json["choices"] as? List<*>
        val first = choices?.firstOrNull() as? Map<*, *> ?: return ""
        return when (wire) {
            WireFormat.FIM_FIELDS, WireFormat.COMPLETION_PROMPT ->
                first["text"]?.toString().orEmpty()
                    .ifBlank {
                        val delta = first["delta"] as? Map<*, *>
                        delta?.get("content")?.toString().orEmpty()
                    }
            WireFormat.CHAT_MESSAGES -> {
                val delta = first["delta"] as? Map<*, *>
                delta?.get("content")?.toString().orEmpty()
                    .ifBlank { first["text"]?.toString().orEmpty() }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseUsage(body: String): Usage? {
        val json = runCatching { Json.parseObject(body) }.getOrNull() ?: return null
        val usage = json["usage"] as? Map<*, *> ?: return null
        return Usage(
            inputTokens = (usage["prompt_tokens"] as? Number)?.toInt(),
            outputTokens = (usage["completion_tokens"] as? Number)?.toInt(),
        )
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
        val idx = rendered.indexOf(':')
        if (idx <= 0) {
            builder.header("Authorization", rendered)
            return
        }
        val name = rendered.substring(0, idx).trim()
        val value = rendered.substring(idx + 1).trim()
        if (name.isNotEmpty() && value.isNotEmpty()) builder.header(name, value)
    }

    private fun applyExtraHeaders(
        builder: HttpRequest.Builder,
        json: String,
    ) {
        if (json.isBlank()) return
        val obj = runCatching { Json.parseObject(json) }.getOrNull() ?: return
        for ((key, value) in obj) {
            val text = value?.toString() ?: continue
            if (key.isNotBlank() && text.isNotBlank()) builder.header(key, text)
        }
    }

    private fun emitSuccess(
        request: HttpRequest,
        template: PromptTemplate,
        started: Long,
        status: Int,
        rawResponseChars: Int?,
        completionChars: Int,
    ) {
        emitLog(
            HttpLogEvent(
                level = LogLevel.INFO,
                operation = operation,
                method = request.method(),
                url = request.uri().toString(),
                model = config.model,
                requestStyle = template.name,
                status = status,
                latencyMs = System.currentTimeMillis() - started,
                responseChars = rawResponseChars,
                message = "request succeeded completionChars=$completionChars template=${template.shortLabel()}",
            ),
        )
    }

    private fun emitFailure(
        request: HttpRequest,
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
                method = request.method(),
                url = request.uri().toString(),
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
        fun createDefaultHttpClient(connectTimeoutMs: Long = 10_000L): HttpClient =
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs.coerceIn(500L, 60_000L)))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build()

        fun joinUrl(
            base: String,
            path: String,
        ): String {
            val b = base.trim().trimEnd('/')
            val p = if (path.startsWith("/")) path else "/$path"
            return b + p
        }

        /**
         * OpenAI-compatible layout: final URL is always `{scheme}://{host}/v1{suffix}`.
         *
         * - base `https://api.example.com/v1` + suffix `/fim/completions`
         *   → path `/fim/completions`
         * - base `https://api.example.com` + suffix `/fim/completions`
         *   → path `/v1/fim/completions`
         */
        fun defaultOpenAiRelativePath(
            baseUrl: String,
            v1Suffix: String,
        ): String {
            val suffix = if (v1Suffix.startsWith("/")) v1Suffix else "/$v1Suffix"
            val basePath = runCatching { URI.create(baseUrl.trim()).path.trimEnd('/') }.getOrDefault("")
            return if (basePath.endsWith("/v1")) suffix else "/v1$suffix"
        }

        private fun modelPaths(baseUrl: String): List<String> {
            val path = runCatching { URI.create(baseUrl.trim()).path.trimEnd('/') }.getOrDefault("")
            return if (path.endsWith("/v1")) listOf("/models") else listOf("/models", "/v1/models")
        }

        fun validateBaseUrl(
            baseUrl: String,
            allowRemote: Boolean,
        ) {
            val uri =
                runCatching { URI.create(baseUrl.trim()) }
                    .getOrElse { throw IllegalArgumentException("Invalid baseUrl: ${baseUrl.trim()}") }
            if (uri.scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
                throw IllegalArgumentException("Invalid baseUrl: ${baseUrl.trim()}")
            }
            if (!allowRemote) {
                val host = uri.host.lowercase()
                val local = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0"
                if (!local) throw IllegalArgumentException("Remote baseUrl blocked by allowRemote=false: ${baseUrl.trim()}")
            }
        }
    }
}
