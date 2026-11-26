package io.autocomplete.bridge

import com.intellij.DynamicBundle
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.ui.JBColor
import io.autocomplete.client.HttpCompletionClient
import io.autocomplete.client.HttpLogEvent
import io.autocomplete.client.HttpStatusException
import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.RequestStyle
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.config.ProviderProfile
import io.autocomplete.config.SettingsValidation
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.Json
import io.autocomplete.util.SecretRedactor
import java.net.URI
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Host-side UiBridge for JetBrains (settings-ui via JCEF).
 * Envelope: { v:1, id, type, payload?, ok?, error? }
 */
class JbUiBridge(
    private val project: Project? = null,
    private val settingsProvider: () -> AutoCompleteSettingsService = { AutoCompleteSettingsService.getInstance() },
    private val appProvider: () -> AutoCompleteAppService = { AutoCompleteAppService.getInstance() },
    private val httpClientFactory: () -> java.net.http.HttpClient = { appProvider().sharedHttpClient() },
    private val clipboardWriter: (String) -> Unit = { text -> CopyPasteManager.copyTextToClipboard(text) },
) {
    private val log = Logger.getInstance(JbUiBridge::class.java)
    private val pushListeners = CopyOnWriteArrayList<(String) -> Unit>()
    @Volatile private var logSubscribed = false
    @Volatile private var subscribedLogLevel: String? = null
    private val pendingLogs = ArrayList<LogEntry>()
    @Volatile private var batchScheduled = false
    private val suppressSelfSettingsPush = ThreadLocal.withInitial { 0 }

    private val logListener: (LogEntry) -> Unit = listener@{ entry ->
        if (!logSubscribed) return@listener
        val minLevel = subscribedLogLevel
        if (!minLevel.isNullOrBlank() && !entry.level.isEnabledBy(minLevel)) return@listener
        synchronized(pendingLogs) {
            pendingLogs += entry
            if (!batchScheduled) {
                batchScheduled = true
                ApplicationManager.getApplication().executeOnPooledThread {
                    Thread.sleep(150)
                    val batch =
                        synchronized(pendingLogs) {
                            batchScheduled = false
                            if (!logSubscribed) {
                                pendingLogs.clear()
                                emptyList()
                            } else {
                                val copy = pendingLogs.toList()
                                pendingLogs.clear()
                                copy
                            }
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

    private val settingsListener: () -> Unit = listener@{
        if (suppressSelfSettingsPush.get() > 0) return@listener
        if (pushListeners.isEmpty()) return@listener
        runCatching {
            push("settingsChanged", snapshotMap(settingsProvider()))
        }
    }

    init {
        runCatching { appProvider().logs.addListener(logListener) }
        runCatching { settingsProvider().addListener(settingsListener) }
    }

    fun addPushListener(listener: (String) -> Unit) {
        pushListeners += listener
    }

    fun removePushListener(listener: (String) -> Unit) {
        pushListeners -= listener
    }

    fun pushThemeChanged(theme: String) {
        push("themeChanged", mapOf("theme" to theme))
    }

    fun pushOpenTab(tab: String) {
        push("openTab", mapOf("tab" to tab))
    }

    fun dispose() {
        logSubscribed = false
        synchronized(pendingLogs) { pendingLogs.clear() }
        runCatching { appProvider().logs.removeListener(logListener) }
        runCatching { settingsProvider().removeListener(settingsListener) }
        pushListeners.clear()
    }

    fun handleJson(requestJson: String): String {
        var id = ""
        var type = "error"
        return try {
            val root = Json.parseObject(requestJson)
            id = root["id"]?.toString().orEmpty()
            type = root["type"]?.toString().orEmpty().ifBlank { "error" }
            @Suppress("UNCHECKED_CAST")
            val payload = root["payload"] as? Map<String, Any?>
            val result = dispatch(type, payload)
            envelope(id, result.type, result.ok, result.payload, result.error)
        } catch (e: Exception) {
            log.warn("UiBridge handle failed", e)
            val redacted = SecretRedactor.redactText(e.message ?: e.javaClass.simpleName)
            envelope(id, type, false, null, redacted)
        }
    }

    private data class DispatchResult(
        val type: String,
        val payload: Any?,
        val ok: Boolean = true,
        val error: String? = null,
    )

    private inline fun <T> withSelfMutation(block: () -> T): T {
        suppressSelfSettingsPush.set(suppressSelfSettingsPush.get() + 1)
        return try {
            block()
        } finally {
            suppressSelfSettingsPush.set((suppressSelfSettingsPush.get() - 1).coerceAtLeast(0))
        }
    }

    private fun dispatch(
        type: String,
        payload: Map<String, Any?>?,
    ): DispatchResult {
        val settings = settingsProvider()
        return when (type) {
            "getSnapshot" -> DispatchResult("snapshot", snapshotMap(settings))
            "applySettings" -> {
                val errors = withSelfMutation { applySettingsValidated(settings, payload) }
                if (errors.isEmpty()) {
                    DispatchResult("applyResult", mapOf("ok" to true, "errors" to emptyList<String>()))
                } else {
                    DispatchResult(
                        type = "applyResult",
                        payload = mapOf("ok" to false, "errors" to errors),
                        ok = false,
                        error = errors.joinToString("; "),
                    )
                }
            }
            "createProfile" -> {
                val preferredName = payload?.get("name")?.toString().orEmpty()
                val preset = payload?.get("preset")?.toString()
                withSelfMutation { settings.createProfile(preferredName = preferredName, preset = preset) }
                DispatchResult("snapshot", snapshotMap(settings))
            }
            "deleteProfile" -> {
                withSelfMutation { settings.deleteProfile(payload?.get("profileId")?.toString().orEmpty()) }
                DispatchResult("snapshot", snapshotMap(settings))
            }
            "selectProfile" -> {
                withSelfMutation { settings.selectProfile(payload?.get("profileId")?.toString().orEmpty()) }
                DispatchResult("snapshot", snapshotMap(settings))
            }
            "renameProfile" -> {
                val profileId = payload?.get("profileId")?.toString().orEmpty()
                val name = payload?.get("name")?.toString().orEmpty()
                withSelfMutation {
                    if (profileId.isNotBlank()) {
                        settings.renameProfile(profileId, name)
                    } else {
                        settings.renameActiveProfile(name)
                    }
                }
                DispatchResult("snapshot", snapshotMap(settings))
            }
            "setSecret" -> {
                val profileId = payload?.get("profileId")?.toString().orEmpty()
                val secret = payload?.get("secret")?.toString().orEmpty()
                withSelfMutation { settings.setApiKeyFor(profileId, secret) }
                DispatchResult(
                    "secretResult",
                    mapOf(
                        "ok" to true,
                        "profileId" to profileId,
                        "hasApiKey" to settings.hasApiKeyFor(profileId),
                    ),
                )
            }
            "clearSecret" -> {
                val profileId = payload?.get("profileId")?.toString().orEmpty()
                withSelfMutation { settings.clearApiKeyForProfile(profileId) }
                DispatchResult(
                    "secretResult",
                    mapOf(
                        "ok" to true,
                        "profileId" to profileId,
                        "hasApiKey" to false,
                    ),
                )
            }
            "testConnection" -> DispatchResult("probeResult", probeConnection(settings, payload))
            "probeTemplate" -> DispatchResult("probeResult", probeOne(settings, payload))
            "probeAllTemplates" -> DispatchResult("probeAllResult", probeAll(settings, payload))
            "listModels" -> DispatchResult("modelsResult", listModels(settings, payload))
            "subscribeLogs" -> {
                val reqLevel = payload?.get("level")?.toString()?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
                val retentionCap = minOf(settings.snapshot().logRetention, MAX_SUBSCRIBED_LOGS).coerceAtLeast(1)
                val limit =
                    ((payload?.get("limit") as? Number)?.toInt() ?: retentionCap)
                        .coerceIn(1, retentionCap)
                subscribedLogLevel = reqLevel
                logSubscribed = true
                val all = appProvider().logs.snapshot()
                val filtered =
                    if (reqLevel != null) {
                        all.filter { it.level.isEnabledBy(reqLevel) }
                    } else {
                        all
                    }
                DispatchResult(
                    "logSubscribed",
                    mapOf(
                        "ok" to true,
                        "entries" to filtered.takeLast(limit).map { logEntryMap(it) },
                    ),
                )
            }
            "unsubscribeLogs" -> {
                logSubscribed = false
                subscribedLogLevel = null
                synchronized(pendingLogs) { pendingLogs.clear() }
                DispatchResult("logUnsubscribed", mapOf("ok" to true))
            }
            "clearLogs" -> {
                appProvider().logs.clear()
                DispatchResult("logsCleared", mapOf("ok" to true))
            }
            "getLogLevel" ->
                DispatchResult("logLevel", mapOf("level" to settings.snapshot().logLevel))
            "getSessionStats" -> {
                val stats = appProvider().engine.sessionStats()
                DispatchResult(
                    "sessionStats",
                    mapOf(
                        "totalRequests" to stats.totalRequests,
                        "cacheHits" to stats.cacheHits,
                        "cancelled" to stats.cancelled,
                        "failed" to stats.failed,
                        "accepted" to stats.accepted,
                        "p50LatencyMs" to stats.p50LatencyMs,
                        "p95LatencyMs" to stats.p95LatencyMs,
                        "currentDebounceMs" to stats.currentDebounceMs,
                        "backoffBlocked" to stats.backoffBlocked,
                        "backoffFatal" to stats.backoffFatal,
                    ),
                )
            }
            "clearCaches" -> {
                val app = appProvider()
                app.engine.clearCaches()
                app.uiState.onAccepted()
                DispatchResult("cachesCleared", mapOf("ok" to true))
            }
            "copyToClipboard" -> {
                val text = payload?.get("text")?.toString().orEmpty()
                clipboardWriter(text)
                DispatchResult("copyResult", mapOf("copied" to true))
            }
            "getPlatform" ->
                DispatchResult(
                    "platform",
                    mapOf(
                        "platform" to "jetbrains",
                        // IDE UI language (not necessarily OS locale)
                        "locale" to ideLocaleTag(),
                        // light | dark — drives settings-ui CSS tokens
                        "theme" to ideTheme(),
                    ),
                )
            "exportSettings" ->
                DispatchResult(
                    "exportResult",
                    mapOf(
                        "json" to SettingsExport.toPrettyJson(SettingsExport.redact(snapshotMap(settings))),
                    ),
                )
            "openExternal" -> {
                val url = payload?.get("url")?.toString()?.trim().orEmpty()
                openExternalUrl(url)
                DispatchResult("openExternalResult", mapOf("ok" to true, "url" to url))
            }
            "openKeymap" -> {
                openManualTriggerKeymap()
                DispatchResult("openKeymapResult", mapOf("ok" to true))
            }
            "importSettings" -> {
                val errors = withSelfMutation { importSettings(settings, payload) }
                if (errors.isEmpty()) {
                    DispatchResult("applyResult", mapOf("ok" to true, "errors" to emptyList<String>()))
                } else {
                    DispatchResult(
                        type = "applyResult",
                        payload = mapOf("ok" to false, "errors" to errors),
                        ok = false,
                        error = errors.joinToString("; "),
                    )
                }
            }
            else -> throw IllegalArgumentException("unknown type: $type")
        }
    }

    private fun importSettings(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): List<String> {
        val rawJson = payload?.get("json")?.toString()?.trim().orEmpty()
        if (rawJson.isEmpty()) {
            throw IllegalArgumentException("import JSON is required")
        }
        val parsed =
            runCatching { Json.parseObject(rawJson) }.getOrElse { e ->
                throw IllegalArgumentException("invalid settings JSON: ${e.message ?: "must be a JSON object"}")
            }

        val sanitized = parsed.toMutableMap()
        if (sanitized.containsKey("profiles")) {
            val rawProfiles =
                sanitized["profiles"] as? List<*>
                    ?: throw IllegalArgumentException("invalid settings JSON: profiles must be an array")
            val idMap = linkedMapOf<String, String>()
            val regenerated = mutableListOf<Map<String, Any?>>()
            for (item in rawProfiles) {
                val rawMap =
                    item as? Map<*, *>
                        ?: throw IllegalArgumentException("invalid settings JSON: each profile must be an object")
                val cleaned =
                    rawMap.entries
                        .associate { it.key.toString() to it.value }
                        .filterKeys { it !in SettingsExport.EXCLUDED_PROFILE_FIELDS }
                        .toMutableMap()
                val oldId = cleaned["id"]?.toString()?.trim().orEmpty()
                val newId = UUID.randomUUID().toString()
                if (oldId.isNotEmpty()) idMap[oldId] = newId
                cleaned["id"] = newId
                // Never inherit local auth/header overrides from existing profiles.
                cleaned["authHeaderTemplate"] = DEFAULT_AUTH_HEADER_TEMPLATE
                cleaned["extraHeadersJson"] = "{}"
                regenerated += cleaned
            }
            sanitized["profiles"] = regenerated
            val oldActive = sanitized["activeProfileId"]?.toString()?.trim().orEmpty()
            sanitized["activeProfileId"] =
                idMap[oldActive]
                    ?: regenerated.firstOrNull()?.get("id")?.toString().orEmpty()
        }

        val previousCredKeys =
            if (sanitized.containsKey("profiles")) {
                settings.profiles().map { it.credentialKey() }
            } else {
                emptyList()
            }

        val errors = applySettingsValidated(settings, sanitized, mergeExistingProfiles = false)
        if (errors.isEmpty() && previousCredKeys.isNotEmpty()) {
            settings.clearSecretsForProfiles(previousCredKeys)
        }
        return errors
    }

    @Suppress("UNCHECKED_CAST")
    private fun applySettingsValidated(
        settings: AutoCompleteSettingsService,
        obj: Map<String, Any?>?,
        mergeExistingProfiles: Boolean = true,
    ): List<String> {
        if (obj == null) return listOf("settings payload is required")
        val current = settings.snapshot()
        val candidate = current.copy(profiles = current.profiles.map { it.copy() }.toMutableList())

        (obj["enabled"] as? Boolean)?.let { candidate.enabled = it }
        (obj["autoTrigger"] as? Boolean)?.let { candidate.autoTrigger = it }
        (obj["enableInComments"] as? Boolean)?.let { candidate.enableInComments = it }
        (obj["enableInStrings"] as? Boolean)?.let { candidate.enableInStrings = it }
        (obj["firstLineOnlyWhenMidLine"] as? Boolean)?.let { candidate.firstLineOnlyWhenMidLine = it }
        (obj["sendFilePath"] as? Boolean)?.let { candidate.sendFilePath = it }
        (obj["showStatusBar"] as? Boolean)?.let { candidate.showStatusBar = it }
        (obj["respectGitignore"] as? Boolean)?.let { candidate.respectGitignore = it }
        obj["ignoreGlobs"]?.let { raw ->
            candidate.ignoreGlobs =
                when (raw) {
                    is String -> raw
                    is List<*> -> raw.joinToString("\n") { it?.toString().orEmpty() }
                    else -> candidate.ignoreGlobs
                }
        }
        obj["disabledLanguages"]?.let { raw ->
            candidate.disabledLanguages =
                when (raw) {
                    is String -> raw
                    is List<*> -> raw.joinToString(", ") { it?.toString().orEmpty() }
                    else -> candidate.disabledLanguages
                }
        }
        (obj["debounceMinMs"] as? Number)?.toInt()?.let { candidate.debounceMinMs = it }
        (obj["debounceInitialMs"] as? Number)?.toInt()?.let { candidate.debounceInitialMs = it }
        (obj["debounceMaxMs"] as? Number)?.toInt()?.let { candidate.debounceMaxMs = it }
        (obj["maxPrefixChars"] as? Number)?.toInt()?.let { candidate.maxPrefixChars = it }
        (obj["maxSuffixChars"] as? Number)?.toInt()?.let { candidate.maxSuffixChars = it }
        (obj["maxInFlight"] as? Number)?.toInt()?.let { candidate.maxInFlight = it }
        (obj["cacheSize"] as? Number)?.toInt()?.let { candidate.cacheSize = it }
        (obj["lruSize"] as? Number)?.toInt()?.let { candidate.lruSize = it }
        (obj["maxFileSizeKb"] as? Number)?.toInt()?.let { candidate.maxFileSizeKb = it }
        (obj["enableRecentFileContext"] as? Boolean)?.let { candidate.enableRecentFileContext = it }
        (obj["recentFileLimit"] as? Number)?.toInt()?.let { candidate.recentFileLimit = it }
        (obj["recentFileMaxChars"] as? Number)?.toInt()?.let { candidate.recentFileMaxChars = it }
        (obj["logLevel"] as? String)?.let { candidate.logLevel = it }
        (obj["logPromptBodies"] as? Boolean)?.let { candidate.logPromptBodies = it }
        (obj["logRetention"] as? Number)?.toInt()?.let { candidate.logRetention = it }
        (obj["notifyOnFatalError"] as? Boolean)?.let { candidate.notifyOnFatalError = it }
        (obj["showCostApprox"] as? Boolean)?.let { candidate.showCostApprox = it }
        (obj["uiTheme"] as? String)?.let { raw ->
            candidate.uiTheme =
                when (raw.trim().lowercase()) {
                    "light" -> "light"
                    "dark" -> "dark"
                    else -> "auto"
                }
        }
        (obj["uiLocale"] as? String)?.let { raw ->
            candidate.uiLocale =
                when (raw.trim().lowercase()) {
                    "en", "zh", "ja", "ko" -> raw.trim().lowercase()
                    else -> "auto"
                }
        }

        val hasProfilesField = obj.containsKey("profiles")
        if (hasProfilesField) {
            val list =
                obj["profiles"] as? List<*>
                    ?: return listOf("profiles must be a JSON array")
            val next = mutableListOf<ProviderProfile>()
            for (item in list) {
                val p = item as? Map<*, *> ?: return listOf("each profile must be a JSON object")
                fun str(k: String) = p[k]?.toString()
                fun int(k: String, d: Int) =
                    (p[k] as? Number)?.toInt() ?: p[k]?.toString()?.toIntOrNull() ?: d
                fun dbl(k: String, d: Double) =
                    (p[k] as? Number)?.toDouble() ?: p[k]?.toString()?.toDoubleOrNull() ?: d
                fun bool(k: String, d: Boolean) =
                    (p[k] as? Boolean) ?: p[k]?.toString()?.toBooleanStrictOrNull() ?: d
                val id = str("id").orEmpty().ifBlank { UUID.randomUUID().toString() }
                val existing =
                    if (mergeExistingProfiles) {
                        candidate.profiles.firstOrNull { it.id == id }
                    } else {
                        null
                    }
                val profile =
                    (existing?.copy() ?: ProviderProfile(id = id)).apply {
                        name = str("name")?.trim()?.ifBlank { name } ?: name
                        str("baseUrl")?.let { baseUrl = it }
                        str("model")?.let { model = it }
                        if (p.containsKey("promptTemplate")) {
                            val nextTemplate = str("promptTemplate") ?: promptTemplate
                            if (nextTemplate != promptTemplate || requestStyle != RequestStyle.AUTO.name) {
                                // Reset legacy requestStyle when promptTemplate is explicitly managed.
                                requestStyle = RequestStyle.AUTO.name
                            }
                            promptTemplate = nextTemplate
                        }
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
                        str("extraBodyJson")?.let { extraBodyJson = it }
                        str("stopSequences")?.let { stopSequences = it }
                        if (p.containsKey("overrideContextBudget")) {
                            overrideContextBudget = bool("overrideContextBudget", overrideContextBudget)
                        }
                        if (p.containsKey("maxPrefixChars")) maxPrefixChars = int("maxPrefixChars", maxPrefixChars)
                        if (p.containsKey("maxSuffixChars")) maxSuffixChars = int("maxSuffixChars", maxSuffixChars)
                    }
                next += profile
            }
            candidate.profiles = next
            candidate.profilesBootstrapped = true
            val active = obj["activeProfileId"]?.toString().orEmpty()
            candidate.activeProfileId =
                if (active.isNotBlank() && candidate.profiles.any { it.id == active }) {
                    active
                } else {
                    candidate.profiles.firstOrNull()?.id.orEmpty()
                }
            val ap = candidate.profiles.firstOrNull { it.id == candidate.activeProfileId }
            if (ap != null) {
                candidate.baseUrl = ap.baseUrl
                candidate.model = ap.model
                candidate.requestStyle = ap.requestStyle
                candidate.promptTemplate = ap.promptTemplate
                candidate.maxTokens = ap.maxTokens
                candidate.temperature = ap.temperature
                candidate.timeoutMs = ap.timeoutMs
                candidate.settingsTimeoutMs = ap.settingsTimeoutMs
                candidate.stream = ap.stream
                candidate.fimPath = ap.fimPath
                candidate.chatPath = ap.chatPath
                candidate.completionsPath = ap.completionsPath
                candidate.authHeaderTemplate = ap.authHeaderTemplate
                candidate.extraHeadersJson = ap.extraHeadersJson
                candidate.extraBodyJson = ap.extraBodyJson
                candidate.stopSequences = ap.stopSequences
                candidate.overrideContextBudget = ap.overrideContextBudget
                candidate.profileMaxPrefixChars = ap.maxPrefixChars
                candidate.profileMaxSuffixChars = ap.maxSuffixChars
            } else {
                val empty = ProviderProfile.empty()
                candidate.baseUrl = empty.baseUrl
                candidate.model = empty.model
                candidate.requestStyle = empty.requestStyle
                candidate.promptTemplate = empty.promptTemplate
                candidate.authHeaderTemplate = empty.authHeaderTemplate
                candidate.extraHeadersJson = empty.extraHeadersJson
                candidate.extraBodyJson = empty.extraBodyJson
                candidate.stopSequences = empty.stopSequences
                candidate.fimPath = empty.fimPath
                candidate.chatPath = empty.chatPath
                candidate.completionsPath = empty.completionsPath
                candidate.overrideContextBudget = false
                candidate.profileMaxPrefixChars = empty.maxPrefixChars
                candidate.profileMaxSuffixChars = empty.maxSuffixChars
            }
        }

        val errors = validateBridgeCandidate(candidate, validateProfiles = hasProfilesField)
        if (errors.isNotEmpty()) return errors

        settings.update {
            enabled = candidate.enabled
            autoTrigger = candidate.autoTrigger
            enableInComments = candidate.enableInComments
            enableInStrings = candidate.enableInStrings
            firstLineOnlyWhenMidLine = candidate.firstLineOnlyWhenMidLine
            sendFilePath = candidate.sendFilePath
            showStatusBar = candidate.showStatusBar
            respectGitignore = candidate.respectGitignore
            ignoreGlobs = candidate.ignoreGlobs
            disabledLanguages = candidate.disabledLanguages
            debounceMinMs = candidate.debounceMinMs
            debounceInitialMs = candidate.debounceInitialMs
            debounceMaxMs = candidate.debounceMaxMs
            maxPrefixChars = candidate.maxPrefixChars
            maxSuffixChars = candidate.maxSuffixChars
            maxInFlight = candidate.maxInFlight
            cacheSize = candidate.cacheSize
            lruSize = candidate.lruSize
            maxFileSizeKb = candidate.maxFileSizeKb
            enableRecentFileContext = candidate.enableRecentFileContext
            recentFileLimit = candidate.recentFileLimit
            recentFileMaxChars = candidate.recentFileMaxChars
            logLevel = candidate.logLevel
            logPromptBodies = candidate.logPromptBodies
            logRetention = candidate.logRetention
            notifyOnFatalError = candidate.notifyOnFatalError
            showCostApprox = candidate.showCostApprox
            uiTheme = candidate.uiTheme
            uiLocale = candidate.uiLocale
            if (hasProfilesField) {
                profiles.clear()
                profiles.addAll(candidate.profiles.map { it.copy() })
                profilesBootstrapped = true
                activeProfileId = candidate.activeProfileId
                baseUrl = candidate.baseUrl
                model = candidate.model
                requestStyle = candidate.requestStyle
                promptTemplate = candidate.promptTemplate
                maxTokens = candidate.maxTokens
                temperature = candidate.temperature
                timeoutMs = candidate.timeoutMs
                settingsTimeoutMs = candidate.settingsTimeoutMs
                stream = candidate.stream
                fimPath = candidate.fimPath
                chatPath = candidate.chatPath
                completionsPath = candidate.completionsPath
                authHeaderTemplate = candidate.authHeaderTemplate
                extraHeadersJson = candidate.extraHeadersJson
                extraBodyJson = candidate.extraBodyJson
                stopSequences = candidate.stopSequences
                overrideContextBudget = candidate.overrideContextBudget
                profileMaxPrefixChars = candidate.profileMaxPrefixChars
                profileMaxSuffixChars = candidate.profileMaxSuffixChars
            }
        }
        return emptyList()
    }

    /**
     * Server-side validation for `applySettings` & `importSettings`.
     * Allows untouched blank draft profiles while still persisting valid global fields,
     * and strictly rejects invalid URLs/schemes/userInfo, credential/reserved headers,
     * raw authHeaderTemplate (missing `${apiKey}`), invalid extraBodyJson, out-of-range
     * numeric parameters, and invalid debounce ordering.
     */
    private fun validateBridgeCandidate(
        candidate: AutoCompleteSettingsService.State,
        validateProfiles: Boolean,
    ): List<String> {
        val errors = mutableListOf<String>()
        if (candidate.debounceMinMs < 0) errors += "debounceMinMs must be >= 0"
        if (candidate.debounceInitialMs < 0) errors += "debounceInitialMs must be >= 0"
        if (candidate.debounceMaxMs < 0) errors += "debounceMaxMs must be >= 0"
        if (candidate.debounceMinMs > candidate.debounceInitialMs) {
            errors += "debounceMinMs must be <= debounceInitialMs"
        }
        if (candidate.debounceInitialMs > candidate.debounceMaxMs) {
            errors += "debounceInitialMs must be <= debounceMaxMs"
        }
        if (candidate.debounceMinMs > candidate.debounceMaxMs) {
            errors += "debounceMinMs must be <= debounceMaxMs"
        }
        if (candidate.maxPrefixChars <= 0) errors += "maxPrefixChars must be > 0"
        if (candidate.maxSuffixChars <= 0) errors += "maxSuffixChars must be > 0"
        if (candidate.maxInFlight < 1) errors += "maxInFlight must be >= 1"
        if (candidate.cacheSize < 1) errors += "cacheSize must be >= 1"
        if (candidate.lruSize < 1) errors += "lruSize must be >= 1"
        if (candidate.maxFileSizeKb < 1) errors += "maxFileSizeKb must be >= 1"
        if (candidate.recentFileLimit < 0) errors += "recentFileLimit must be >= 0"
        if (candidate.recentFileMaxChars < 1) errors += "recentFileMaxChars must be >= 1"
        if (candidate.logRetention !in 50..10_000) errors += "logRetention must be 50..10000"

        if (validateProfiles) {
            for (profile in candidate.profiles) {
                val effPrefix = if (profile.overrideContextBudget) profile.maxPrefixChars else candidate.maxPrefixChars
                val effSuffix = if (profile.overrideContextBudget) profile.maxSuffixChars else candidate.maxSuffixChars
                val pErrors =
                    SettingsValidation.validate(
                        baseUrl = profile.baseUrl,
                        model = profile.model,
                        timeoutMs = profile.timeoutMs,
                        settingsTimeoutMs = profile.settingsTimeoutMs,
                        maxTokens = profile.maxTokens,
                        maxPrefixChars = effPrefix,
                        maxSuffixChars = effSuffix,
                        allowRemote = true,
                        extraHeadersJson = profile.extraHeadersJson,
                        // Blank/in-progress drafts remain saveable so global edits & pre-fetch model saves work,
                        // while every populated field is strictly format- and security-validated.
                        requireConnection = false,
                        authHeaderTemplate = profile.authHeaderTemplate,
                        extraBodyJson = profile.extraBodyJson,
                    )
                errors += pErrors
                if (!profile.temperature.isFinite() || profile.temperature < 0.0 || profile.temperature > 2.0) {
                    errors += "temperature must be 0..2"
                }
            }
        }
        return errors.distinct()
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
                    "extraBodyJson" to p.extraBodyJson,
                    "stopSequences" to p.stopSequences,
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

    /**
     * Resolve target [ProviderConfig] for a probe/model request WITHOUT mutating `activeProfileId`.
     */
    private fun resolveConfigForProbe(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
        requireModel: Boolean,
    ): ProviderConfig {
        val profileId = payload?.get("profileId")?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        val cfg = settings.providerConfigFor(profileId)
        val errors =
            SettingsValidation.validate(
                baseUrl = cfg.baseUrl,
                model = cfg.model,
                timeoutMs = cfg.timeoutMs,
                settingsTimeoutMs = cfg.settingsTimeoutMs,
                maxTokens = cfg.maxTokens,
                maxPrefixChars = settings.effectiveMaxPrefixChars(),
                maxSuffixChars = settings.effectiveMaxSuffixChars(),
                allowRemote = true,
                extraHeadersJson = cfg.extraHeadersJson,
                requireConnection = requireModel,
                authHeaderTemplate = cfg.authHeaderTemplate,
                extraBodyJson = cfg.extraBodyJson,
            ).toMutableList()
        if (!requireModel && cfg.baseUrl.isBlank()) {
            errors.add(0, "baseUrl is required")
        }
        if (errors.isNotEmpty()) {
            throw IllegalArgumentException(errors.joinToString("; "))
        }
        return cfg
    }

    private fun probeLogCallback(settings: AutoCompleteSettingsService): (HttpLogEvent) -> Unit =
        { event ->
            val app = appProvider()
            app.logs.appendIfEnabled(
                LogEntry(
                    level = event.level,
                    operation = event.operation,
                    method = event.method,
                    url = event.url,
                    model = event.model,
                    requestStyle = event.requestStyle,
                    status = event.status,
                    latencyMs = event.latencyMs,
                    responseChars = event.responseChars,
                    message = event.message,
                    error = event.error,
                ),
                settings.snapshot().logLevel,
            )
        }

    private fun probeConnection(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        val cfg = resolveConfigForProbe(settings, payload, requireModel = true)
        val resolvedTemplate = HttpCompletionClient.resolveTemplate(cfg)
        val resolvedPath = HttpCompletionClient.resolvePath(resolvedTemplate, cfg)
        val resolvedUrl = SecretRedactor.redactUrl(HttpCompletionClient.resolveUrl(resolvedTemplate, cfg))
        val client =
            HttpCompletionClient(
                config = cfg,
                http = httpClientFactory(),
                operation = "connection_test",
                onLog = probeLogCallback(settings),
            )
        val started = System.currentTimeMillis()
        return try {
            val resp = client.testConnection()
            mapOf(
                "template" to resolvedTemplate.name,
                "status" to if (resp.text.isBlank()) "EMPTY" else "SUCCESS",
                "httpStatus" to resp.rawStatus,
                "latencyMs" to (System.currentTimeMillis() - started),
                "preview" to resp.text.replace('\n', ' ').trim().take(80),
                "resolvedPath" to resolvedPath,
                "resolvedUrl" to resolvedUrl,
            )
        } catch (e: Exception) {
            val status = extractHttpStatus(e)
            mapOf(
                "template" to resolvedTemplate.name,
                "status" to "FAILED",
                "httpStatus" to status,
                "latencyMs" to (System.currentTimeMillis() - started),
                "error" to SecretRedactor.redactText(e.message ?: e.javaClass.simpleName, cfg.apiKey),
                "resolvedPath" to resolvedPath,
                "resolvedUrl" to resolvedUrl,
            )
        }
    }

    private fun probeOne(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        val cfg = resolveConfigForProbe(settings, payload, requireModel = true)
        val template = PromptTemplate.fromStored(payload?.get("template")?.toString())
        val client =
            HttpCompletionClient(
                config = cfg,
                http = httpClientFactory(),
                operation = "template_probe",
                onLog = probeLogCallback(settings),
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
            "resolvedUrl" to r.resolvedUrl,
        )
    }

    private fun probeAll(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        val cfg = resolveConfigForProbe(settings, payload, requireModel = true)
        val client =
            HttpCompletionClient(
                config = cfg,
                http = httpClientFactory(),
                operation = "template_probe_all",
                onLog = probeLogCallback(settings),
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
                    "resolvedUrl" to r.resolvedUrl,
                )
            }
        return mapOf("results" to results)
    }

    private fun listModels(
        settings: AutoCompleteSettingsService,
        payload: Map<String, Any?>?,
    ): Map<String, Any?> {
        val cfg = resolveConfigForProbe(settings, payload, requireModel = false)
        val client =
            HttpCompletionClient(
                config = cfg,
                http = httpClientFactory(),
                operation = "list_models",
                onLog = probeLogCallback(settings),
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

    private fun extractHttpStatus(error: Throwable): Int? {
        var cur: Throwable? = error
        while (cur != null) {
            if (cur is HttpStatusException) return cur.status
            cur = cur.cause.takeIf { it !== cur }
        }
        return null
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

    /**
     * Open http(s) URLs in the system browser (settings-ui About links).
     * Rejects non-http(s) schemes for safety under JCEF.
     */
    private fun openExternalUrl(raw: String) {
        val url = raw.trim()
        require(url.isNotEmpty()) { "url is required" }
        val uri =
            runCatching { URI(url) }.getOrElse {
                throw IllegalArgumentException("invalid url")
            }
        val scheme = uri.scheme?.lowercase().orEmpty()
        require(scheme == "http" || scheme == "https") { "invalid url scheme" }
        ApplicationManager.getApplication().invokeLater({
            BrowserUtil.browse(url)
        }, ModalityState.any())
    }

    /**
     * Open IDE Keymap settings via the public [ShowSettingsUtil] API (no internal `EditKeymapsDialog`).
     */
    private fun openManualTriggerKeymap() {
        ApplicationManager.getApplication().invokeLater({
            val targetProject =
                project?.takeUnless { it.isDisposed }
                    ?: ProjectManager.getInstance().openProjects.firstOrNull { !it.isDisposed }
            ShowSettingsUtil.getInstance().showSettingsDialog(
                targetProject,
                { configurable -> (configurable as? SearchableConfigurable)?.id == "preferences.keymap" },
                null,
            )
        }, ModalityState.any())
    }

    companion object {
        private const val DEFAULT_AUTH_HEADER_TEMPLATE = "Authorization: Bearer \${apiKey}"
        private const val MAX_SUBSCRIBED_LOGS = 2000

        /** BCP-47 tag matching IDE UI language (DynamicBundle). */
        fun ideLocaleTag(): String =
            runCatching { DynamicBundle.getLocale().toLanguageTag() }
                .getOrElse { java.util.Locale.getDefault().toLanguageTag() }

        fun ideTheme(): String = if (JBColor.isBright()) "light" else "dark"
    }
}
