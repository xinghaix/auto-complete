package io.autocomplete.config

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.RoamingType
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SettingsCategory
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.RequestStyle
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.IgnoreRules
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Service(Service.Level.APP)
@State(
    name = "AutoCompleteSettings",
    storages = [Storage("autoCompleteSettings.xml", roamingType = RoamingType.DISABLED)],
    category = SettingsCategory.PLUGINS,
)
class AutoCompleteSettingsService :
    PersistentStateComponent<AutoCompleteSettingsService.State>,
    Disposable {
    data class State(
        var enabled: Boolean = true,
        var autoTrigger: Boolean = true,
        /**
         * Deprecated: shortcut is owned by IDE Keymap (action [TRIGGER_ACTION_ID]).
         * Kept only so older settings XML still loads; not written by the UI.
         */
        var manualShortcut: String = "ctrl shift SPACE",
        var snoozeUntil: Long = 0,
        var showStatusBar: Boolean = true,
        /**
         * Settings panel theme preference: `auto` (follow IDE), `light`, or `dark`.
         * Does not change the IDE Look and Feel — only the JCEF settings UI.
         */
        var uiTheme: String = "auto",
        /**
         * Settings panel UI locale: `auto` (follow IDE) or a fixed catalog id
         * (`en` / `zh` / `ja` / `ko`). Does not change the IDE UI language.
         */
        var uiLocale: String = "auto",
        /** Active profile id; empty when no saved profiles. */
        var activeProfileId: String = "",
        /** Named connection profiles (provider / endpoint / model / timeouts…). */
        var profiles: MutableList<ProviderProfile> = mutableListOf(),
        /**
         * Once true, an empty [profiles] list is intentional (user deleted all).
         * When false and profiles empty, migrate legacy flat fields into one profile.
         */
        var profilesBootstrapped: Boolean = false,
        // --- Active connection fields (mirror of the selected profile for hot path) ---
        var provider: String = ProviderKind.OPENAI_COMPATIBLE.name,
        var baseUrl: String = "http://127.0.0.1:11434/v1",
        var model: String = "qwen2.5-coder:7b",
        var authHeaderTemplate: String = "Authorization: Bearer \${apiKey}",
        var extraHeadersJson: String = "{}",
        var extraBodyJson: String = "",
        var stopSequences: String = "",
        var fimPath: String = "",
        var chatPath: String = "/chat/completions",
        var completionsPath: String = "",
        var responsesPath: String = "",
        var requestStyle: String = RequestStyle.AUTO.name,
        var promptTemplate: String = PromptTemplate.AUTO.name,
        var temperature: Double = 0.0,
        var maxTokens: Int = 128,
        var timeoutMs: Int = ProviderConfig.DEFAULT_TIMEOUT_MS,
        var settingsTimeoutMs: Int = ProviderConfig.DEFAULT_SETTINGS_TIMEOUT_MS,
        var stream: Boolean = false,
        var allowRemote: Boolean = true,
        /** Active-profile mirror: override Performance-tab prefix/suffix budgets. */
        var overrideContextBudget: Boolean = false,
        var profileMaxPrefixChars: Int = 8000,
        var profileMaxSuffixChars: Int = 2000,
        // --- Global behavior (not per-profile) ---
        var enableInComments: Boolean = true,
        var enableInStrings: Boolean = true,
        var disabledLanguages: String = "",
        var firstLineOnlyWhenMidLine: Boolean = true,
        var debounceMinMs: Int = 150,
        var debounceInitialMs: Int = 300,
        var debounceMaxMs: Int = 1000,
        var maxPrefixChars: Int = 8000,
        var maxSuffixChars: Int = 2000,
        var maxInFlight: Int = 1,
        var cacheSize: Int = 20,
        var lruSize: Int = 64,
        var maxFileSizeKb: Int = 512,
        var enableRecentFileContext: Boolean = false,
        var recentFileLimit: Int = 3,
        var recentFileMaxChars: Int = 1200,
        var respectGitignore: Boolean = true,
        var ignoreGlobs: String = IgnoreRules.DEFAULT_GLOBS.joinToString("\n"),
        var sendFilePath: Boolean = true,
        var logPromptBodies: Boolean = false,
        var logLevel: String = "info",
        var logRetention: Int = io.autocomplete.log.LogBuffer.DEFAULT_RETENTION,
        var notifyOnFatalError: Boolean = true,
        var showCostApprox: Boolean = false,
    )

    private val stateLock = Any()
    private var state = State()
    private val listeners = CopyOnWriteArraySet<() -> Unit>()

    // In-memory secret presence/value cache so EDT paths never block on PasswordSafe IPC.
    private val hasApiKeyCache = ConcurrentHashMap<String, Boolean>()
    private val apiKeyCache = ConcurrentHashMap<String, String>()
    private val warmingInFlight = AtomicBoolean(false)
    private val secretIoExecutor =
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "auto-complete-secret-io").apply { isDaemon = true }
        }

    override fun getState(): State =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            syncActiveProfileFromFlatLocked()
            state.copy(profiles = state.profiles.map { it.copy() }.toMutableList())
        }

    override fun loadState(state: State) {
        synchronized(stateLock) {
            this.state = state.copy(profiles = state.profiles.map { it.copy() }.toMutableList())
            hasApiKeyCache.clear()
            apiKeyCache.clear()
            ensureProfilesMigratedLocked()
            activeProfileLocked()?.let { applyProfileToFlatLocked(it) }
        }
        warmSecretsAsync()
    }

    fun addListener(listener: () -> Unit) {
        listeners += listener
    }

    fun removeListener(listener: () -> Unit) {
        listeners -= listener
    }

    fun notifyChanged() {
        listeners.forEach { runCatching { it.invoke() } }
    }

    fun snapshot(): State =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            state.copy(profiles = state.profiles.map { it.copy() }.toMutableList())
        }

    fun update(block: State.() -> Unit) {
        synchronized(stateLock) {
            state.block()
            ensureProfilesMigratedLocked()
            activeProfileLocked()?.let { syncActiveProfileFromFlatLocked() }
        }
        notifyChanged()
    }

    fun isEnabledNow(): Boolean =
        synchronized(stateLock) {
            state.enabled && state.snoozeUntil <= System.currentTimeMillis()
        }

    fun isSnoozed(): Boolean =
        synchronized(stateLock) {
            state.snoozeUntil > System.currentTimeMillis()
        }

    fun snooze(minutes: Int) {
        synchronized(stateLock) {
            state.snoozeUntil =
                if (minutes <= 0) {
                    0
                } else {
                    System.currentTimeMillis() + minutes * 60_000L
                }
        }
        notifyChanged()
    }

    fun unsnooze() {
        synchronized(stateLock) {
            state.snoozeUntil = 0
        }
        notifyChanged()
    }

    fun disabledLanguageSet(): Set<String> =
        synchronized(stateLock) {
            parseDisabledLanguages(state.disabledLanguages)
        }

    /**
     * Toggle a normalized language id in `disabledLanguages`.
     * Returns `true` if the language is now disabled, `false` if re-enabled.
     */
    fun toggleLanguageDisabled(languageId: String): Boolean {
        val target = languageId.trim().lowercase()
        if (target.isEmpty()) return false
        val nowDisabled =
            synchronized(stateLock) {
                val set = parseDisabledLanguages(state.disabledLanguages).toMutableSet()
                val added =
                    if (target in set) {
                        set.remove(target)
                        false
                    } else {
                        set.add(target)
                        true
                    }
                state.disabledLanguages = set.sorted().joinToString(", ")
                added
            }
        notifyChanged()
        return nowDisabled
    }

    fun ignoreGlobList(): List<String> =
        synchronized(stateLock) {
            state.ignoreGlobs
                .lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toList()
                .ifEmpty { IgnoreRules.DEFAULT_GLOBS }
        }

    fun profiles(): List<ProviderProfile> =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            state.profiles.map { it.copy() }
        }

    fun activeProfileId(): String =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            state.activeProfileId
        }

    fun activeProfile(): ProviderProfile? =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            activeProfileLocked()?.copy()
        }

    fun profileById(id: String): ProviderProfile? =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            state.profiles.firstOrNull { it.id == id }?.copy()
        }

    /**
     * Create a blank or preset-seeded profile (does not copy current form), select it, and initialize empty API key state.
     */
    fun createProfile(
        preferredName: String = ProviderProfile.DEFAULT_NAME,
        preset: String? = null,
    ): ProviderProfile {
        val created =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                if (state.activeProfileId.isNotBlank() && state.profiles.any { it.id == state.activeProfileId }) {
                    syncActiveProfileFromFlatLocked()
                }
                val baseName =
                    preferredName.trim().ifBlank {
                        ProviderProfile.defaultNameForPreset(preset)
                    }
                val name = ProviderProfile.uniqueName(baseName, state.profiles.map { it.name })
                val profile = ProviderProfile.fromPreset(preset, name)
                state.profiles.add(profile)
                state.activeProfileId = profile.id
                state.profilesBootstrapped = true
                applyProfileToFlatLocked(profile)
                val credKey = profile.credentialKey()
                apiKeyCache[credKey] = ""
                hasApiKeyCache[credKey] = false
                profile.copy()
            }
        notifyChanged()
        return created
    }

    /**
     * Switch active profile and load its fields into the flat runtime state.
     */
    fun selectProfile(id: String): Boolean {
        val changed =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                val profile = state.profiles.firstOrNull { it.id == id } ?: return false
                if (state.activeProfileId.isNotBlank() &&
                    state.activeProfileId != id &&
                    state.profiles.any { it.id == state.activeProfileId }
                ) {
                    syncActiveProfileFromFlatLocked()
                }
                state.activeProfileId = profile.id
                applyProfileToFlatLocked(profile)
                true
            }
        if (changed) notifyChanged()
        return changed
    }

    fun renameActiveProfile(name: String): String {
        val unique =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                val profile = activeProfileLocked() ?: return name.trim().ifBlank { ProviderProfile.DEFAULT_NAME }
                val next =
                    ProviderProfile.uniqueName(
                        name,
                        state.profiles.filter { it.id != profile.id }.map { it.name },
                    )
                profile.name = next
                next
            }
        notifyChanged()
        return unique
    }

    fun renameProfile(
        profileId: String,
        name: String,
    ): String {
        val unique =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                val profile =
                    state.profiles.firstOrNull { it.id == profileId }
                        ?: return name.trim().ifBlank { ProviderProfile.DEFAULT_NAME }
                val next =
                    ProviderProfile.uniqueName(
                        name,
                        state.profiles.filter { it.id != profile.id }.map { it.name },
                    )
                profile.name = next
                next
            }
        notifyChanged()
        return unique
    }

    /**
     * Delete a profile. Allowed to delete the last one (list becomes empty).
     */
    fun deleteProfile(id: String): Boolean {
        var removedCredKey: String? = null
        var clearLegacy = false
        val deleted =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                val idx = state.profiles.indexOfFirst { it.id == id }
                if (idx < 0) return false
                val removed = state.profiles.removeAt(idx)
                removedCredKey = removed.credentialKey()
                apiKeyCache.remove(removedCredKey)
                hasApiKeyCache.remove(removedCredKey)
                state.profilesBootstrapped = true
                if (state.profiles.isEmpty()) {
                    state.activeProfileId = ""
                    applyEmptyConnectionToFlatLocked()
                    clearLegacy = true
                } else if (state.activeProfileId == id) {
                    val next =
                        state.profiles.getOrNull(idx.coerceAtMost(state.profiles.lastIndex))
                            ?: state.profiles.first()
                    state.activeProfileId = next.id
                    applyProfileToFlatLocked(next)
                }
                true
            }
        if (deleted) {
            removedCredKey?.let { persistSecret(it, null) }
            if (clearLegacy) persistSecret("apiKey", null)
            notifyChanged()
        }
        return deleted
    }

    fun clearSecretsForProfiles(credentialKeys: Collection<String>) {
        if (credentialKeys.isEmpty()) return
        for (credKey in credentialKeys) {
            apiKeyCache.remove(credKey)
            hasApiKeyCache.remove(credKey)
            persistSecret(credKey, null)
        }
    }

    fun hasProfiles(): Boolean =
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
            state.profiles.isNotEmpty()
        }

    /**
     * Returns the API key for the active profile.
     * NEVER falls back to legacy `"apiKey"` once profiles exist (fixes cross-profile secret leak).
     */
    fun getApiKey(): String {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                if (state.profiles.isNotEmpty()) {
                    activeProfileLocked()?.credentialKey()
                } else {
                    null
                }
            } ?: return ""
        return readSecretByCredentialKey(credKey)
    }

    fun getApiKeyFor(profileId: String): String {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                state.profiles.firstOrNull { it.id == profileId }?.credentialKey()
            } ?: return ""
        return readSecretByCredentialKey(credKey)
    }

    fun hasApiKeyFor(profileId: String): Boolean {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                state.profiles.firstOrNull { it.id == profileId }?.credentialKey()
            } ?: return false
        hasApiKeyCache[credKey]?.let { return it }
        if (shouldAvoidBlockingEdt()) {
            warmSecretsAsync()
            return false
        }
        val secret = readPasswordSafe(credKey)
        apiKeyCache[credKey] = secret
        val present = secret.isNotBlank()
        hasApiKeyCache[credKey] = present
        return present
    }

    fun setApiKey(value: String) {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                activeProfileLocked()?.credentialKey() ?: return
            }
        updateSecretCacheAndPersist(credKey, value)
        notifyChanged()
    }

    fun setApiKeyFor(
        profileId: String,
        value: String,
    ) {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                state.profiles.firstOrNull { it.id == profileId }?.credentialKey() ?: return
            }
        updateSecretCacheAndPersist(credKey, value)
        notifyChanged()
    }

    fun clearApiKeyForProfile(profileId: String) {
        val credKey =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                state.profiles.firstOrNull { it.id == profileId }?.credentialKey() ?: return
            }
        updateSecretCacheAndPersist(credKey, "")
        notifyChanged()
    }

    override fun dispose() {
        listeners.clear()
        secretIoExecutor.shutdown()
    }

    private fun runSecretIo(task: () -> Unit) {
        if (secretIoExecutor.isShutdown) return
        runCatching { secretIoExecutor.execute(task) }
    }

    /**
     * Warm cached `hasApiKey` flags off-EDT so UI snapshots and EDT checks never block on PasswordSafe IPC.
     */
    fun warmSecretsAsync() {
        val app = ApplicationManager.getApplication()
        if (app == null || app.isUnitTestMode) {
            warmSecretsNow()
            return
        }
        if (secretIoExecutor.isShutdown) return
        if (!warmingInFlight.compareAndSet(false, true)) return
        runSecretIo {
            try {
                warmSecretsNow()
            } finally {
                warmingInFlight.set(false)
            }
        }
    }

    private fun warmSecretsNow() {
        val keys =
            synchronized(stateLock) {
                state.profiles.map { it.credentialKey() }
            }
        var changed = false
        for (credKey in keys) {
            val secret = readPasswordSafe(credKey)
            val present = secret.isNotBlank()
            val prev = hasApiKeyCache.put(credKey, present)
            apiKeyCache[credKey] = secret
            if (prev != null && prev != present) {
                changed = true
            }
        }
        if (changed) {
            notifyChanged()
        }
    }

    fun applyValidated(
        candidate: State,
        apiKey: String,
    ): List<String> {
        var credKeyToWrite: String? = null
        var valueToWrite: String? = null
        var clearLegacy = false
        val errors =
            synchronized(stateLock) {
                val profiles = candidate.profiles.map { it.copy() }.toMutableList()
                var activeId = candidate.activeProfileId.ifBlank { state.activeProfileId }
                if (profiles.none { it.id == activeId }) {
                    activeId = profiles.firstOrNull()?.id.orEmpty()
                }
                val normalized =
                    if (profiles.isEmpty()) {
                        val empty = ProviderProfile.empty()
                        candidate.copy(
                            profiles = profiles,
                            activeProfileId = "",
                            profilesBootstrapped = true,
                            provider = empty.provider,
                            baseUrl = empty.baseUrl,
                            model = empty.model,
                            authHeaderTemplate = empty.authHeaderTemplate,
                            extraHeadersJson = empty.extraHeadersJson,
                            extraBodyJson = empty.extraBodyJson,
                            stopSequences = empty.stopSequences,
                            fimPath = empty.fimPath,
                            chatPath = empty.chatPath,
                            completionsPath = empty.completionsPath,
                            responsesPath = empty.responsesPath,
                            requestStyle = empty.requestStyle,
                            promptTemplate = empty.promptTemplate,
                            temperature = empty.temperature,
                            maxTokens = empty.maxTokens,
                            timeoutMs = empty.timeoutMs,
                            settingsTimeoutMs = empty.settingsTimeoutMs,
                            stream = empty.stream,
                            allowRemote = true,
                            overrideContextBudget = false,
                            profileMaxPrefixChars = empty.maxPrefixChars,
                            profileMaxSuffixChars = empty.maxSuffixChars,
                        )
                    } else {
                        candidate.copy(
                            profiles = profiles,
                            activeProfileId = activeId,
                            profilesBootstrapped = true,
                            allowRemote = true,
                        )
                    }
                val errs = validateState(normalized)
                if (errs.isNotEmpty()) return@synchronized errs
                state = normalized
                syncActiveProfileFromFlatLocked()
                if (profiles.isEmpty()) {
                    clearLegacy = true
                } else {
                    val key = activeProfileLocked()?.credentialKey()
                    if (key != null) {
                        credKeyToWrite = key
                        valueToWrite = apiKey
                        apiKeyCache[key] = apiKey
                        hasApiKeyCache[key] = apiKey.isNotBlank()
                    }
                }
                emptyList()
            }
        if (errors.isNotEmpty()) return errors
        if (clearLegacy) {
            persistSecret("apiKey", null)
        } else if (credKeyToWrite != null) {
            persistSecret(credKeyToWrite!!, valueToWrite)
        }
        notifyChanged()
        return emptyList()
    }

    fun providerConfig(): ProviderConfig = providerConfigFor(null)

    /**
     * Resolve a [ProviderConfig] for a specific [profileId] (or active profile when null/blank)
     * WITHOUT mutating [State.activeProfileId].
     */
    fun providerConfigFor(profileId: String?): ProviderConfig {
        val profile =
            synchronized(stateLock) {
                ensureProfilesMigratedLocked()
                if (!profileId.isNullOrBlank()) {
                    state.profiles.firstOrNull { it.id == profileId }?.copy()
                        ?: throw IllegalArgumentException("unknown profileId: $profileId")
                } else {
                    activeProfileLocked()?.copy()
                }
            }
        if (profile != null) {
            return providerConfigFromProfile(profile, readSecretByCredentialKey(profile.credentialKey()))
        }
        val snap = snapshot()
        return ProviderConfig(
            kind = ProviderKind.normalize(snap.provider),
            baseUrl = snap.baseUrl.trim(),
            apiKey = "",
            model = snap.model.trim(),
            authHeaderTemplate = snap.authHeaderTemplate,
            extraHeadersJson = snap.extraHeadersJson,
            extraBodyJson = snap.extraBodyJson,
            stopSequences = snap.stopSequences,
            fimPath = snap.fimPath.trim(),
            chatPath = snap.chatPath.trim().ifBlank { "/chat/completions" },
            completionsPath = snap.completionsPath.trim(),
            responsesPath = snap.responsesPath.trim(),
            requestStyle = parseRequestStyle(snap.requestStyle),
            promptTemplate = resolveTemplateFor(snap.promptTemplate, snap.requestStyle),
            temperature = snap.temperature,
            maxTokens = snap.maxTokens,
            timeoutMs = snap.timeoutMs,
            settingsTimeoutMs = snap.settingsTimeoutMs,
            stream = snap.stream,
            allowRemote = true,
        )
    }

    fun providerConfigFromProfile(
        profile: ProviderProfile,
        apiKey: String,
    ): ProviderConfig =
        ProviderConfig(
            kind = ProviderKind.normalize(profile.provider),
            baseUrl = profile.baseUrl.trim(),
            apiKey = apiKey,
            model = profile.model.trim(),
            authHeaderTemplate = profile.authHeaderTemplate,
            extraHeadersJson = profile.extraHeadersJson,
            extraBodyJson = profile.extraBodyJson,
            stopSequences = profile.stopSequences,
            fimPath = profile.fimPath.trim(),
            chatPath = profile.chatPath.trim().ifBlank { "/chat/completions" },
            completionsPath = profile.completionsPath.trim(),
            responsesPath = profile.responsesPath.trim(),
            requestStyle = parseRequestStyle(profile.requestStyle),
            promptTemplate = resolveTemplateFor(profile.promptTemplate, profile.requestStyle),
            temperature = profile.temperature,
            maxTokens = profile.maxTokens,
            timeoutMs = profile.timeoutMs,
            settingsTimeoutMs = profile.settingsTimeoutMs,
            stream = profile.stream,
            // Remote endpoints always allowed (legacy allowRemote=false ignored).
            allowRemote = true,
        )

    fun resolveStoredTemplate(): PromptTemplate =
        synchronized(stateLock) {
            resolveTemplateFor(state.promptTemplate, state.requestStyle)
        }

    fun resolveTemplateFor(
        promptTemplate: String,
        requestStyle: String,
    ): PromptTemplate {
        val raw = promptTemplate.trim()
        if (raw.isNotEmpty() && raw != PromptTemplate.AUTO.name) {
            return PromptTemplate.fromStored(raw)
        }
        if (raw.isEmpty() && requestStyle in setOf(RequestStyle.FIM.name, RequestStyle.CHAT.name)) {
            return PromptTemplate.fromLegacyRequestStyle(requestStyle)
        }
        return PromptTemplate.fromStored(raw.ifEmpty { PromptTemplate.AUTO.name })
    }

    fun validate(candidate: State = snapshot()): List<String> = validateState(candidate)

    fun validateState(candidate: State): List<String> {
        val effectivePrefix =
            if (candidate.overrideContextBudget) candidate.profileMaxPrefixChars else candidate.maxPrefixChars
        val effectiveSuffix =
            if (candidate.overrideContextBudget) candidate.profileMaxSuffixChars else candidate.maxSuffixChars
        val errors =
            SettingsValidation.validate(
                baseUrl = candidate.baseUrl,
                model = candidate.model,
                timeoutMs = candidate.timeoutMs,
                settingsTimeoutMs = candidate.settingsTimeoutMs,
                maxTokens = candidate.maxTokens,
                maxPrefixChars = effectivePrefix,
                maxSuffixChars = effectiveSuffix,
                // Legacy allowRemote=false is ignored (remote switch removed).
                allowRemote = true,
                extraHeadersJson = candidate.extraHeadersJson,
                // No saved profile -> blank endpoint is intentional (user deleted all / never created).
                requireConnection = candidate.profiles.isNotEmpty(),
                authHeaderTemplate = candidate.authHeaderTemplate,
                extraBodyJson = candidate.extraBodyJson,
                debounceMinMs = candidate.debounceMinMs,
                debounceInitialMs = candidate.debounceInitialMs,
                debounceMaxMs = candidate.debounceMaxMs,
            ).toMutableList()
        if (candidate.maxPrefixChars <= 0 && "maxPrefixChars must be > 0" !in errors) {
            errors += "maxPrefixChars must be > 0"
        }
        if (candidate.maxSuffixChars <= 0 && "maxSuffixChars must be > 0" !in errors) {
            errors += "maxSuffixChars must be > 0"
        }
        if (!candidate.temperature.isFinite() || candidate.temperature < 0.0 || candidate.temperature > 2.0) {
            errors += "temperature must be 0..2"
        }
        return errors
    }

    fun validateProfile(
        profile: ProviderProfile,
        globalState: State = snapshot(),
        requireConnection: Boolean = true,
    ): List<String> {
        val effectivePrefix =
            if (profile.overrideContextBudget) profile.maxPrefixChars else globalState.maxPrefixChars
        val effectiveSuffix =
            if (profile.overrideContextBudget) profile.maxSuffixChars else globalState.maxSuffixChars
        val errors =
            SettingsValidation.validate(
                baseUrl = profile.baseUrl,
                model = profile.model,
                timeoutMs = profile.timeoutMs,
                settingsTimeoutMs = profile.settingsTimeoutMs,
                maxTokens = profile.maxTokens,
                maxPrefixChars = effectivePrefix,
                maxSuffixChars = effectiveSuffix,
                allowRemote = true,
                extraHeadersJson = profile.extraHeadersJson,
                requireConnection = requireConnection,
                authHeaderTemplate = profile.authHeaderTemplate,
                extraBodyJson = profile.extraBodyJson,
                debounceMinMs = globalState.debounceMinMs,
                debounceInitialMs = globalState.debounceInitialMs,
                debounceMaxMs = globalState.debounceMaxMs,
            ).toMutableList()
        if (!profile.temperature.isFinite() || profile.temperature < 0.0 || profile.temperature > 2.0) {
            errors += "temperature must be 0..2"
        }
        return errors
    }

    /**
     * One-time migration from pre-profile settings. After bootstrap, empty list is allowed.
     * Deletes the legacy `"apiKey"` PasswordSafe entry immediately after migrating it.
     */
    fun ensureProfilesMigrated() {
        synchronized(stateLock) {
            ensureProfilesMigratedLocked()
        }
    }

    private fun ensureProfilesMigratedLocked() {
        if (!state.profilesBootstrapped) {
            state.profilesBootstrapped = true
            if (state.profiles.isEmpty()) {
                val hasConnection = state.baseUrl.isNotBlank() || state.model.isNotBlank()
                if (shouldAvoidBlockingEdt()) {
                    var migratedProfile: ProviderProfile? = null
                    if (hasConnection) {
                        val name =
                            ProviderProfile.uniqueName(
                                suggestNameFromEndpoint(state.baseUrl, state.model),
                                emptyList(),
                            )
                        val profile = ProviderProfile(name = name).also { copyFlatToProfileLocked(it) }
                        profile.name = name
                        state.profiles.add(profile)
                        state.activeProfileId = profile.id
                        migratedProfile = profile.copy()
                    }
                    val targetId = migratedProfile?.id
                    runSecretIo {
                        migrateLegacySecretOffEdt(targetId)
                    }
                } else {
                    val legacyKey = readLegacyPasswordSafe()
                    if (hasConnection || legacyKey.isNotEmpty()) {
                        val name =
                            ProviderProfile.uniqueName(
                                suggestNameFromEndpoint(state.baseUrl, state.model),
                                emptyList(),
                            )
                        val profile = ProviderProfile(name = name).also { copyFlatToProfileLocked(it) }
                        profile.name = name
                        state.profiles.add(profile)
                        state.activeProfileId = profile.id
                        if (legacyKey.isNotEmpty()) {
                            val credKey = profile.credentialKey()
                            writePasswordSafe(credKey, legacyKey)
                            apiKeyCache[credKey] = legacyKey
                            hasApiKeyCache[credKey] = true
                        }
                    }
                    // Always delete legacy single-key entry right after migration so it can never leak later.
                    if (legacyKey.isNotEmpty()) {
                        clearLegacyPasswordSafe()
                    }
                }
            }
        }
        if (state.profiles.isEmpty()) {
            state.activeProfileId = ""
            return
        }
        if (state.profiles.none { it.id == state.activeProfileId }) {
            state.activeProfileId = state.profiles.first().id
        }
    }

    private fun migrateLegacySecretOffEdt(initialProfileId: String?) {
        val legacyKey = readLegacyPasswordSafe()
        if (legacyKey.isEmpty()) return
        val credKey =
            synchronized(stateLock) {
                val target =
                    (initialProfileId?.let { id -> state.profiles.firstOrNull { it.id == id } }
                        ?: activeProfileLocked())
                        ?: run {
                            val name =
                                ProviderProfile.uniqueName(
                                    suggestNameFromEndpoint(state.baseUrl, state.model),
                                    emptyList(),
                                )
                            val profile = ProviderProfile(name = name).also { copyFlatToProfileLocked(it) }
                            profile.name = name
                            state.profiles.add(profile)
                            state.activeProfileId = profile.id
                            profile
                        }
                target.credentialKey()
            }
        writePasswordSafe(credKey, legacyKey)
        apiKeyCache[credKey] = legacyKey
        hasApiKeyCache[credKey] = true
        clearLegacyPasswordSafe()
        notifyChanged()
    }

    private fun activeProfileLocked(): ProviderProfile? =
        state.profiles.firstOrNull { it.id == state.activeProfileId }
            ?: state.profiles.firstOrNull()

    private fun applyEmptyConnectionToFlatLocked() {
        val empty = ProviderProfile.empty()
        applyProfileToFlatLocked(empty)
    }

    private fun syncActiveProfileFromFlatLocked() {
        val profile = state.profiles.firstOrNull { it.id == state.activeProfileId } ?: return
        val name = profile.name
        // Collapse legacy provider kind before writing into the profile snapshot.
        state.provider = ProviderKind.normalize(state.provider).name
        copyFlatToProfileLocked(profile)
        profile.name = name
    }

    private fun applyProfileToFlatLocked(profile: ProviderProfile) {
        state.provider = ProviderKind.normalize(profile.provider).name
        state.baseUrl = profile.baseUrl
        state.model = profile.model
        state.authHeaderTemplate = profile.authHeaderTemplate
        state.extraHeadersJson = profile.extraHeadersJson
        state.extraBodyJson = profile.extraBodyJson
        state.stopSequences = profile.stopSequences
        state.fimPath = profile.fimPath
        state.chatPath = profile.chatPath
        state.completionsPath = profile.completionsPath
        state.responsesPath = profile.responsesPath
        state.requestStyle = profile.requestStyle
        state.promptTemplate = profile.promptTemplate
        state.temperature = profile.temperature
        state.maxTokens = profile.maxTokens
        state.timeoutMs = profile.timeoutMs
        state.settingsTimeoutMs = profile.settingsTimeoutMs
        state.stream = profile.stream
        state.allowRemote = true
        state.overrideContextBudget = profile.overrideContextBudget
        state.profileMaxPrefixChars = profile.maxPrefixChars
        state.profileMaxSuffixChars = profile.maxSuffixChars
    }

    private fun copyFlatToProfileLocked(profile: ProviderProfile) {
        profile.provider = state.provider
        profile.baseUrl = state.baseUrl
        profile.model = state.model
        profile.authHeaderTemplate = state.authHeaderTemplate
        profile.extraHeadersJson = state.extraHeadersJson
        profile.extraBodyJson = state.extraBodyJson
        profile.stopSequences = state.stopSequences
        profile.fimPath = state.fimPath
        profile.chatPath = state.chatPath
        profile.completionsPath = state.completionsPath
        profile.responsesPath = state.responsesPath
        profile.requestStyle = state.requestStyle
        profile.promptTemplate = state.promptTemplate
        profile.temperature = state.temperature
        profile.maxTokens = state.maxTokens
        profile.timeoutMs = state.timeoutMs
        profile.settingsTimeoutMs = state.settingsTimeoutMs
        profile.stream = state.stream
        profile.allowRemote = true
        profile.overrideContextBudget = state.overrideContextBudget
        profile.maxPrefixChars = state.profileMaxPrefixChars
        profile.maxSuffixChars = state.profileMaxSuffixChars
    }

    /** Effective prefix budget: profile override when enabled, else Performance tab. */
    fun effectiveMaxPrefixChars(): Int =
        synchronized(stateLock) {
            if (state.overrideContextBudget) state.profileMaxPrefixChars else state.maxPrefixChars
        }

    /** Effective suffix budget: profile override when enabled, else Performance tab. */
    fun effectiveMaxSuffixChars(): Int =
        synchronized(stateLock) {
            if (state.overrideContextBudget) state.profileMaxSuffixChars else state.maxSuffixChars
        }

    private fun readSecretByCredentialKey(credKey: String): String {
        apiKeyCache[credKey]?.let { return it }
        if (shouldAvoidBlockingEdt()) {
            warmSecretsAsync()
            return ""
        }
        val secret = readPasswordSafe(credKey)
        apiKeyCache[credKey] = secret
        hasApiKeyCache[credKey] = secret.isNotBlank()
        return secret
    }

    private fun updateSecretCacheAndPersist(
        credKey: String,
        value: String,
    ) {
        val clean = if (value.isBlank()) "" else value
        apiKeyCache[credKey] = clean
        hasApiKeyCache[credKey] = clean.isNotBlank()
        persistSecret(credKey, clean.ifBlank { null })
    }

    private fun persistSecret(
        credKey: String,
        value: String?,
    ) {
        if (shouldAvoidBlockingEdt()) {
            runSecretIo {
                writePasswordSafe(credKey, value)
            }
        } else {
            writePasswordSafe(credKey, value)
        }
    }

    private fun readPasswordSafe(credentialKey: String): String =
        runCatching {
            PasswordSafe.instance.getPassword(credentialAttributes(credentialKey)).orEmpty()
        }.getOrDefault("")

    private fun readLegacyPasswordSafe(): String =
        runCatching {
            PasswordSafe.instance.getPassword(legacyCredentialAttributes()).orEmpty()
        }.getOrDefault("")

    private fun clearLegacyPasswordSafe() {
        runCatching {
            PasswordSafe.instance.set(legacyCredentialAttributes(), null)
        }
    }

    private fun writePasswordSafe(
        credentialKey: String,
        value: String?,
    ) {
        val attrs = credentialAttributes(credentialKey)
        runCatching {
            if (value.isNullOrBlank()) {
                PasswordSafe.instance.set(attrs, null)
            } else {
                PasswordSafe.instance.set(attrs, Credentials("auto-complete", value))
            }
        }
    }

    private fun shouldAvoidBlockingEdt(): Boolean {
        val app = ApplicationManager.getApplication() ?: return false
        return app.isDispatchThread && !app.isUnitTestMode
    }

    private fun credentialAttributes(key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName("AutoComplete", key))

    internal fun legacyCredentialAttributes(): CredentialAttributes =
        CredentialAttributes(generateServiceName("AutoComplete", "apiKey"))

    private fun parseRequestStyle(raw: String): RequestStyle =
        runCatching { RequestStyle.valueOf(raw) }.getOrDefault(RequestStyle.AUTO)

    private fun parseDisabledLanguages(raw: String): Set<String> =
        raw
            .split(',', '\n', ';')
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .toSet()

    private fun suggestNameFromEndpoint(
        baseUrl: String,
        model: String,
    ): String {
        val host =
            runCatching { java.net.URI(baseUrl.trim()).host }
                .getOrNull()
                ?.removePrefix("www.")
                ?.ifBlank { null }
        return when {
            !host.isNullOrBlank() && model.isNotBlank() -> "$host / $model"
            !host.isNullOrBlank() -> host
            model.isNotBlank() -> model
            else -> ProviderProfile.DEFAULT_NAME
        }
    }

    companion object {
        /** Action id for manual trigger; shortcut is configured in IDE Keymap. */
        const val TRIGGER_ACTION_ID = "AutoComplete.Trigger"

        fun getInstance(): AutoCompleteSettingsService =
            ApplicationManager.getApplication().getService(AutoCompleteSettingsService::class.java)
    }
}
