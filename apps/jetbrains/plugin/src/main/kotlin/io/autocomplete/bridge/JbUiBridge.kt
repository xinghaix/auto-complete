package io.autocomplete.bridge

import com.intellij.DynamicBundle
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.JBColor
import io.autocomplete.client.HttpCompletionClient
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.config.ProviderProfile
import io.autocomplete.log.LogEntry
import io.autocomplete.net.IdeHttpSupport
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.Json
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Host-side UiBridge for JetBrains (settings-ui via JCEF).
 * Envelope: { v:1, id, type, payload?, ok?, error? }
 */
class JbUiBridge {
    private val log = Logger.getInstance(JbUiBridge::class.java)
    private val pushListeners = CopyOnWriteArrayList<(String) -> Unit>()
    @Volatile private var logSubscribed = false
    private val pendingLogs = ArrayList<LogEntry>()
    @Volatile private var batchScheduled = false

    private val logListener: (LogEntry) -> Unit = listener@{ entry ->
        if (!logSubscribed) return@listener
        synchronized(pendingLogs) {
            pendingLogs += entry
            if (!batchScheduled) {
                batchScheduled = true
                ApplicationManager.getApplication().executeOnPooledThread {
                    Thread.sleep(150)
                    val batch =
                        synchronized(pendingLogs) {
                            batchScheduled = false
                            val copy = pendingLogs.toList()
                            pendingLogs.clear()
                            copy
                        }
                    if (batch.isNotEmpty()) {
                        push(
                            "logBatch",
                            mapOf("entries" to batch.map { logEntryMap(it) }),
                        )
                    }
                }
            }
        }
    }

    init {
        AutoCompleteAppService.getInstance().logs.addListener(logListener)
    }

    fun addPushListener(listener: (String) -> Unit) {
        pushListeners += listener
    }

    fun removePushListener(listener: (String) -> Unit) {
        pushListeners -= listener
    }

    fun dispose() {
        AutoCompleteAppService.getInstance().logs.removeListener(logListener)
        pushListeners.clear()
    }

    fun handleJson(requestJson: String): String {
        return try {
            val root = Json.parseObject(requestJson)
            val id = root["id"]?.toString().orEmpty()
            val type = root["type"]?.toString().orEmpty()
            @Suppress("UNCHECKED_CAST")
            val payload = root["payload"] as? Map<String, Any?>
            val (respType, respPayload) = dispatch(type, payload)
            envelope(id, respType, true, respPayload, null)
        } catch (e: Exception) {
            log.warn("UiBridge handle failed", e)
            envelope("", "error", false, null, e.message ?: e.javaClass.simpleName)
        }
    }

    private fun dispatch(
        type: String,
        payload: Map<String, Any?>?,
    ): Pair<String, Any?> {
        val settings = AutoCompleteSettingsService.getInstance()
        return when (type) {
            "getSnapshot" -> "snapshot" to snapshotMap(settings)
            "applySettings" -> {
                applySettings(settings, payload)
                "applyResult" to mapOf("ok" to true, "errors" to emptyList<String>())
            }
            "createProfile" -> {
                settings.createProfile()
                "snapshot" to snapshotMap(settings)
            }
            "deleteProfile" -> {
                settings.deleteProfile(payload?.get("profileId")?.toString().orEmpty())
                "snapshot" to snapshotMap(settings)
            }
            "selectProfile" -> {
                settings.selectProfile(payload?.get("profileId")?.toString().orEmpty())
                "snapshot" to snapshotMap(settings)
            }
            "renameProfile" -> {
                val id = payload?.get("profileId")?.toString().orEmpty()
                val name = payload?.get("name")?.toString().orEmpty()
                if (settings.activeProfileId() != id) settings.selectProfile(id)
                settings.renameActiveProfile(name)
                "snapshot" to snapshotMap(settings)
            }
            "setSecret" -> {
                val id = payload?.get("profileId")?.toString().orEmpty()
                val secret = payload?.get("secret")?.toString().orEmpty()
                settings.setApiKeyFor(id, secret)
                "secretResult" to mapOf("ok" to true, "hasApiKey" to settings.hasApiKeyFor(id))
            }
            "clearSecret" -> {
                val id = payload?.get("profileId")?.toString().orEmpty()
                settings.clearApiKeyForProfile(id)
                "secretResult" to mapOf("ok" to true)
            }
            "testConnection" -> "probeResult" to probeConnection(settings, payload)
            "probeTemplate" -> "probeResult" to probeOne(settings, payload)
            "probeAllTemplates" -> "probeAllResult" to probeAll(settings, payload)
            "listModels" -> "modelsResult" to listModels(settings, payload)
            "subscribeLogs" -> {
                logSubscribed = true
                val snap = AutoCompleteAppService.getInstance().logs.snapshot()
                "logSubscribed" to
                    mapOf(
                        "ok" to true,
                        "entries" to snap.takeLast(200).map { logEntryMap(it) },
                    )
            }
            "unsubscribeLogs" -> {
                logSubscribed = false
                "logUnsubscribed" to mapOf("ok" to true)
            }
            "clearLogs" -> {
                AutoCompleteAppService.getInstance().logs.clear()
                "logsCleared" to mapOf("ok" to true)
            }
            "getLogLevel" ->
                "logLevel" to mapOf("level" to settings.snapshot().logLevel)
            "getPlatform" ->
                "platform" to
                    mapOf(
                        "platform" to "jetbrains",
                        // IDE UI language (not necessarily OS locale)
                        "locale" to ideLocaleTag(),
                        // light | dark — drives settings-ui CSS tokens
                        "theme" to ideTheme(),
                    )
            "exportSettings" ->
                "exportResult" to
                    mapOf("json" to Json.obj(*snapshotMap(settings).entries.map { it.key to it.value }.toTypedArray()))
            "importSettings" -> {
                val json = payload?.get("json")?.toString().orEmpty()
                val parsed = Json.parseObject(json).toMutableMap()
                @Suppress("UNCHECKED_CAST")
                val profiles = parsed["profiles"] as? List<*>
                if (profiles != null) {
                    parsed["profiles"] =
                        profiles.mapNotNull { item ->
                            val m = (item as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }?.toMutableMap()
                                ?: return@mapNotNull null
                            m.remove("apiKey")
                            m.remove("hasApiKey")
                            m
                        }
                }
                applySettings(settings, parsed)
                "applyResult" to mapOf("ok" to true, "errors" to emptyList<String>())
            }
            else -> throw IllegalArgumentException("unknown type: $type")
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun applySettings(
        settings: AutoCompleteSettingsService,
        obj: Map<String, Any?>?,
    ) {
        if (obj == null) return
        settings.update {
            (obj["enabled"] as? Boolean)?.let { enabled = it }
            (obj["autoTrigger"] as? Boolean)?.let { autoTrigger = it }
            (obj["enableInComments"] as? Boolean)?.let { enableInComments = it }
            (obj["enableInStrings"] as? Boolean)?.let { enableInStrings = it }
            (obj["firstLineOnlyWhenMidLine"] as? Boolean)?.let { firstLineOnlyWhenMidLine = it }
            (obj["sendFilePath"] as? Boolean)?.let { sendFilePath = it }
            (obj["showStatusBar"] as? Boolean)?.let { showStatusBar = it }
            (obj["respectGitignore"] as? Boolean)?.let { respectGitignore = it }
            obj["ignoreGlobs"]?.let { raw ->
                ignoreGlobs =
                    when (raw) {
                        is String -> raw
                        is List<*> -> raw.joinToString("\n") { it?.toString().orEmpty() }
                        else -> ignoreGlobs
                    }
            }
            obj["disabledLanguages"]?.let { raw ->
                disabledLanguages =
                    when (raw) {
                        is String -> raw
                        is List<*> -> raw.joinToString(", ") { it?.toString().orEmpty() }
                        else -> disabledLanguages
                    }
            }
            (obj["debounceMinMs"] as? Number)?.toInt()?.let { debounceMinMs = it }
            (obj["debounceInitialMs"] as? Number)?.toInt()?.let { debounceInitialMs = it }
            (obj["debounceMaxMs"] as? Number)?.toInt()?.let { debounceMaxMs = it }
            (obj["maxPrefixChars"] as? Number)?.toInt()?.let { maxPrefixChars = it }
            (obj["maxSuffixChars"] as? Number)?.toInt()?.let { maxSuffixChars = it }
            (obj["maxInFlight"] as? Number)?.toInt()?.let { maxInFlight = it }
            (obj["cacheSize"] as? Number)?.toInt()?.let { cacheSize = it }
            (obj["lruSize"] as? Number)?.toInt()?.let { lruSize = it }
            (obj["maxFileSizeKb"] as? Number)?.toInt()?.let { maxFileSizeKb = it }
            (obj["enableRecentFileContext"] as? Boolean)?.let { enableRecentFileContext = it }
            (obj["recentFileLimit"] as? Number)?.toInt()?.let { recentFileLimit = it }
            (obj["recentFileMaxChars"] as? Number)?.toInt()?.let { recentFileMaxChars = it }
            (obj["logLevel"] as? String)?.let { logLevel = it }
            (obj["logPromptBodies"] as? Boolean)?.let { logPromptBodies = it }
            (obj["logRetention"] as? Number)?.toInt()?.let { logRetention = it }
            (obj["notifyOnFatalError"] as? Boolean)?.let { notifyOnFatalError = it }
            (obj["showCostApprox"] as? Boolean)?.let { showCostApprox = it }
            (obj["uiTheme"] as? String)?.let { raw ->
                uiTheme =
                    when (raw.trim().lowercase()) {
                        "light" -> "light"
                        "dark" -> "dark"
                        else -> "auto"
                    }
            }
            (obj["uiLocale"] as? String)?.let { raw ->
                uiLocale =
                    when (raw.trim().lowercase()) {
                        "en", "zh", "ja", "ko" -> raw.trim().lowercase()
                        else -> "auto"
                    }
            }
            val list = obj["profiles"] as? List<*>
            if (list != null) {
                val next = mutableListOf<ProviderProfile>()
                for (item in list) {
                    val p = item as? Map<*, *> ?: continue
                    fun str(k: String) = p[k]?.toString()
                    fun int(k: String, d: Int) =
                        (p[k] as? Number)?.toInt() ?: p[k]?.toString()?.toIntOrNull() ?: d
                    fun dbl(k: String, d: Double) =
                        (p[k] as? Number)?.toDouble() ?: p[k]?.toString()?.toDoubleOrNull() ?: d
                    fun bool(k: String, d: Boolean) =
                        (p[k] as? Boolean) ?: p[k]?.toString()?.toBooleanStrictOrNull() ?: d
                    val id = str("id").orEmpty().ifBlank { UUID.randomUUID().toString() }
                    val existing = profiles.firstOrNull { it.id == id }
                    val profile =
                        (existing?.copy() ?: ProviderProfile(id = id)).apply {
                            name = str("name") ?: name
                            str("baseUrl")?.let { baseUrl = it }
                            str("model")?.let { model = it }
                            str("promptTemplate")?.let { promptTemplate = it }
                            if (p.containsKey("maxTokens")) maxTokens = int("maxTokens", maxTokens)
                            if (p.containsKey("temperature")) temperature = dbl("temperature", temperature)
                            if (p.containsKey("timeoutMs")) timeoutMs = int("timeoutMs", timeoutMs)
                            if (p.containsKey("settingsTimeoutMs")) {
                                settingsTimeoutMs = int("settingsTimeoutMs", settingsTimeoutMs)
                            }
                            if (p.containsKey("stream")) stream = bool("stream", stream)
                            str("fimPath")?.let { fimPath = it }
                            str("chatPath")?.let { chatPath = it }
                            str("completionsPath")?.let { completionsPath = it }
                            str("authHeaderTemplate")?.let { authHeaderTemplate = it }
                            str("extraHeadersJson")?.let { extraHeadersJson = it }
                            if (p.containsKey("overrideContextBudget")) {
                                overrideContextBudget = bool("overrideContextBudget", overrideContextBudget)
                            }
                            if (p.containsKey("maxPrefixChars")) maxPrefixChars = int("maxPrefixChars", maxPrefixChars)
                            if (p.containsKey("maxSuffixChars")) maxSuffixChars = int("maxSuffixChars", maxSuffixChars)
                        }
                    next += profile
                }
                profiles.clear()
                profiles.addAll(next)
                profilesBootstrapped = true
                val active = obj["activeProfileId"]?.toString().orEmpty()
                activeProfileId =
                    if (active.isNotBlank() && profiles.any { it.id == active }) {
                        active
                    } else {
                        profiles.firstOrNull()?.id.orEmpty()
                    }
                val ap = profiles.firstOrNull { it.id == activeProfileId }
                if (ap != null) {
                    baseUrl = ap.baseUrl
                    model = ap.model
                    promptTemplate = ap.promptTemplate
                    maxTokens = ap.maxTokens
                    temperature = ap.temperature
                    timeoutMs = ap.timeoutMs
                    settingsTimeoutMs = ap.settingsTimeoutMs
                    stream = ap.stream
                    fimPath = ap.fimPath
                    chatPath = ap.chatPath
                    completionsPath = ap.completionsPath
                    authHeaderTemplate = ap.authHeaderTemplate
                    extraHeadersJson = ap.extraHeadersJson
                    overrideContextBudget = ap.overrideContextBudget
                    profileMaxPrefixChars = ap.maxPrefixChars
                    profileMaxSuffixChars = ap.maxSuffixChars
                }
            }
        }
    }

    private fun snapshotMap(settings: AutoCompleteSettingsService): Map<String, Any?> {
        val s = settings.snapshot()
        val profiles =
            s.profiles.map { p ->
                mapOf(
                    "id" to p.id,
                    "name" to p.name,
                    "provider" to "openai-compatible",
                    "baseUrl" to p.baseUrl,
                    "model" to p.model,
                    "promptTemplate" to p.promptTemplate,
                    "maxTokens" to p.maxTokens,
                    "temperature" to p.temperature,
                    "timeoutMs" to p.timeoutMs,
                    "settingsTimeoutMs" to p.settingsTimeoutMs,
                    "stream" to p.stream,
                    "hasApiKey" to settings.hasApiKeyFor(p.id),
                    "fimPath" to p.fimPath,
                    "chatPath" to p.chatPath,
                    "completionsPath" to p.completionsPath,
                    "authHeaderTemplate" to p.authHeaderTemplate,
                    "extraHeadersJson" to p.extraHeadersJson,
                    "overrideContextBudget" to p.overrideContextBudget,
                    "maxPrefixChars" to p.maxPrefixChars,
                    "maxSuffixChars" to p.maxSuffixChars,
                )
            }
        return mapOf(
            "schemaVersion" to 1,
            "enabled" to s.enabled,
            "autoTrigger" to s.autoTrigger,
            "activeProfileId" to s.activeProfileId,
            "profiles" to profiles,
            "enableInComments" to s.enableInComments,
            "enableInStrings" to s.enableInStrings,
            "firstLineOnlyWhenMidLine" to s.firstLineOnlyWhenMidLine,
            "sendFilePath" to s.sendFilePath,
            "showStatusBar" to s.showStatusBar,
            "respectGitignore" to s.respectGitignore,
            "ignoreGlobs" to s.ignoreGlobs,
            "disabledLanguages" to s.disabledLanguages,
            "debounceMinMs" to s.debounceMinMs,
            "debounceInitialMs" to s.debounceInitialMs,
            "debounceMaxMs" to s.debounceMaxMs,
            "maxPrefixChars" to s.maxPrefixChars,
            "maxSuffixChars" to s.maxSuffixChars,
            "maxInFlight" to s.maxInFlight,
            "cacheSize" to s.cacheSize,
            "lruSize" to s.lruSize,
            "maxFileSizeKb" to s.maxFileSizeKb,
            "enableRecentFileContext" to s.enableRecentFileContext,
            "recentFileLimit" to s.recentFileLimit,
            "recentFileMaxChars" to s.recentFileMaxChars,
            "logLevel" to s.logLevel,
            "logPromptBodies" to s.logPromptBodies,
            "logRetention" to s.logRetention,
            "notifyOnFatalError" to s.notifyOnFatalError,
            "showCostApprox" to s.showCostApprox,
            "uiTheme" to s.uiTheme,
            "uiLocale" to s.uiLocale,
        )
    }

    private fun resolveAndMaybeSelect(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ) {
        val profileId = payload?.get("profileId")?.toString()
        if (!profileId.isNullOrBlank() && profileId != settings.activeProfileId()) {
            settings.selectProfile(profileId)
        }
    }

    private fun probeConnection(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        resolveAndMaybeSelect(settings, payload)
        val client =
            HttpCompletionClient(
                config = settings.providerConfig(),
                http = IdeHttpSupport.createClient(),
                operation = "connection_test",
            )
        val started = System.currentTimeMillis()
        return try {
            val resp = client.testConnection()
            mapOf(
                "status" to if (resp.text.isBlank()) "EMPTY" else "SUCCESS",
                "httpStatus" to resp.rawStatus,
                "latencyMs" to (System.currentTimeMillis() - started),
                "preview" to resp.text.replace('\n', ' ').trim().take(80),
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "FAILED",
                "latencyMs" to (System.currentTimeMillis() - started),
                "error" to e.message.orEmpty(),
            )
        }
    }

    private fun probeOne(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        resolveAndMaybeSelect(settings, payload)
        val template = PromptTemplate.fromStored(payload?.get("template")?.toString())
        val client =
            HttpCompletionClient(
                config = settings.providerConfig(),
                http = IdeHttpSupport.createClient(),
                operation = "template_probe",
            )
        val r = client.probeTemplate(template)
        return mapOf(
            "template" to r.template.name,
            "status" to r.status.name,
            "httpStatus" to r.httpStatus,
            "latencyMs" to r.latencyMs,
            "preview" to r.preview,
            "error" to r.error,
            "resolvedPath" to r.resolvedPath,
        )
    }

    private fun probeAll(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        resolveAndMaybeSelect(settings, payload)
        val client =
            HttpCompletionClient(
                config = settings.providerConfig(),
                http = IdeHttpSupport.createClient(),
                operation = "template_probe_all",
            )
        val results =
            client.probeAllTemplates().map { r ->
                mapOf(
                    "template" to r.template.name,
                    "status" to r.status.name,
                    "httpStatus" to r.httpStatus,
                    "latencyMs" to r.latencyMs,
                    "preview" to r.preview,
                    "error" to r.error,
                    "resolvedPath" to r.resolvedPath,
                )
            }
        return mapOf("results" to results)
    }

    private fun listModels(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        resolveAndMaybeSelect(settings, payload)
        val client =
            HttpCompletionClient(
                config = settings.providerConfig(),
                http = IdeHttpSupport.createClient(),
                operation = "list_models",
            )
        val models =
            client.listModels().map { m ->
                buildMap {
                    put("id", m.id)
                    m.contextLength?.let { put("contextLength", it) }
                }
            }
        return mapOf("models" to models)
    }

    private fun logEntryMap(e: LogEntry): Map<String, Any?> =
        mapOf(
            "time" to e.time.toString(),
            "level" to e.level.name.lowercase(),
            "requestId" to e.requestId,
            "file" to e.file,
            "trigger" to e.trigger,
            "cacheHit" to e.cacheHit,
            "latencyMs" to e.latencyMs,
            "status" to e.status,
            "error" to e.error,
            "operation" to e.operation,
            "method" to e.method,
            "url" to e.url,
            "model" to e.model,
            "requestStyle" to e.requestStyle,
            "responseChars" to e.responseChars,
            "message" to e.message,
        )

    private fun push(
        type: String,
        payload: Any?,
    ) {
        val msg = envelope("", type, true, payload, null)
        pushListeners.forEach { runCatching { it(msg) } }
    }

    private fun envelope(
        id: String,
        type: String,
        ok: Boolean,
        payload: Any?,
        error: String?,
    ): String =
        Json.obj(
            "v" to 1,
            "id" to id,
            "type" to type,
            "ok" to ok,
            "payload" to payload,
            "error" to error,
        )

    companion object {
        /** BCP-47 tag matching IDE UI language (DynamicBundle). */
        fun ideLocaleTag(): String =
            runCatching { DynamicBundle.getLocale().toLanguageTag() }
                .getOrElse { java.util.Locale.getDefault().toLanguageTag() }

        fun ideTheme(): String = if (JBColor.isBright()) "light" else "dark"
    }
}
