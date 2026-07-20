package io.autocomplete.config

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.RequestStyle
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.IgnoreRules

@Service(Service.Level.APP)
@State(name = "AutoCompleteSettings", storages = [Storage("autoCompleteSettings.xml")])
class AutoCompleteSettingsService : PersistentStateComponent<AutoCompleteSettingsService.State> {
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
        var fimPath: String = "",
        var chatPath: String = "/chat/completions",
        var completionsPath: String = "",
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

    private var state = State()
    private val listeners = LinkedHashSet<() -> Unit>()

    override fun getState(): State {
        ensureProfilesMigrated()
        syncActiveProfileFromFlat()
        return state
    }

    override fun loadState(state: State) {
        this.state = state
        ensureProfilesMigrated()
        applyProfileToFlat(activeProfile() ?: return)
    }

    fun addListener(listener: () -> Unit) {
        listeners += listener
    }

    fun removeListener(listener: () -> Unit) {
        listeners -= listener
    }

    fun notifyChanged() {
        listeners.toList().forEach { runCatching { it.invoke() } }
    }

    fun snapshot(): State {
        ensureProfilesMigrated()
        return state.copy(profiles = state.profiles.map { it.copy() }.toMutableList())
    }

    fun update(block: State.() -> Unit) {
        state.block()
        ensureProfilesMigrated()
        notifyChanged()
    }

    fun isEnabledNow(): Boolean = state.enabled && !isSnoozed()

    fun isSnoozed(): Boolean = state.snoozeUntil > System.currentTimeMillis()

    fun snooze(minutes: Int) {
        state.snoozeUntil =
            if (minutes <= 0) {
                0
            } else {
                System.currentTimeMillis() + minutes * 60_000L
            }
        notifyChanged()
    }

    fun unsnooze() {
        state.snoozeUntil = 0
        notifyChanged()
    }

    fun disabledLanguageSet(): Set<String> =
        state.disabledLanguages
            .split(',', '\n', ';')
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .toSet()

    fun ignoreGlobList(): List<String> =
        state.ignoreGlobs
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()
            .ifEmpty { IgnoreRules.DEFAULT_GLOBS }

    fun profiles(): List<ProviderProfile> {
        ensureProfilesMigrated()
        return state.profiles.map { it.copy() }
    }

    fun activeProfileId(): String {
        ensureProfilesMigrated()
        return state.activeProfileId
    }

    fun activeProfile(): ProviderProfile? {
        ensureProfilesMigrated()
        return state.profiles.firstOrNull { it.id == state.activeProfileId }
            ?: state.profiles.firstOrNull()
    }

    /**
     * Create a **blank** profile (does not copy current form), select it, clear API key.
     */
    fun createProfile(preferredName: String = ProviderProfile.DEFAULT_NAME): ProviderProfile {
        ensureProfilesMigrated()
        // If editing an existing profile, save flat → that profile before switching away.
        if (state.activeProfileId.isNotBlank() && state.profiles.any { it.id == state.activeProfileId }) {
            syncActiveProfileFromFlat()
        }
        val name =
            ProviderProfile.uniqueName(
                preferredName,
                state.profiles.map { it.name },
            )
        val profile = ProviderProfile.empty(name)
        state.profiles.add(profile)
        state.activeProfileId = profile.id
        state.profilesBootstrapped = true
        applyProfileToFlat(profile)
        storeApiKey(profile.credentialKey(), "")
        notifyChanged()
        return profile.copy()
    }

    /**
     * Switch active profile and load its fields into the flat runtime state.
     */
    fun selectProfile(id: String): Boolean {
        ensureProfilesMigrated()
        val profile = state.profiles.firstOrNull { it.id == id } ?: return false
        if (state.activeProfileId.isNotBlank() &&
            state.activeProfileId != id &&
            state.profiles.any { it.id == state.activeProfileId }
        ) {
            syncActiveProfileFromFlat()
        }
        state.activeProfileId = profile.id
        applyProfileToFlat(profile)
        notifyChanged()
        return true
    }

    fun renameActiveProfile(name: String): String {
        ensureProfilesMigrated()
        val profile = activeProfile() ?: return name.trim().ifBlank { ProviderProfile.DEFAULT_NAME }
        val unique =
            ProviderProfile.uniqueName(
                name,
                state.profiles.filter { it.id != profile.id }.map { it.name },
            )
        profile.name = unique
        notifyChanged()
        return unique
    }

    /**
     * Delete a profile. Allowed to delete the last one (list becomes empty).
     */
    fun deleteProfile(id: String): Boolean {
        ensureProfilesMigrated()
        val idx = state.profiles.indexOfFirst { it.id == id }
        if (idx < 0) return false
        val removed = state.profiles.removeAt(idx)
        clearApiKeyFor(removed.credentialKey())
        state.profilesBootstrapped = true
        if (state.profiles.isEmpty()) {
            state.activeProfileId = ""
            applyEmptyConnectionToFlat()
            storeApiKey("apiKey", "")
        } else if (state.activeProfileId == id) {
            val next = state.profiles.getOrNull(idx.coerceAtMost(state.profiles.lastIndex))
                ?: state.profiles.first()
            state.activeProfileId = next.id
            applyProfileToFlat(next)
        }
        notifyChanged()
        return true
    }

    fun hasProfiles(): Boolean {
        ensureProfilesMigrated()
        return state.profiles.isNotEmpty()
    }

    fun getApiKey(): String {
        ensureProfilesMigrated()
        val key = activeProfile()?.credentialKey() ?: "apiKey"
        val primary = PasswordSafe.instance.getPassword(credentialAttributes(key)).orEmpty()
        if (primary.isNotEmpty()) return primary
        // Legacy single-key migration.
        return PasswordSafe.instance.getPassword(legacyCredentialAttributes()).orEmpty()
    }

    fun getApiKeyFor(profileId: String): String {
        ensureProfilesMigrated()
        val profile = state.profiles.firstOrNull { it.id == profileId } ?: return ""
        return PasswordSafe.instance.getPassword(credentialAttributes(profile.credentialKey())).orEmpty()
    }

    fun hasApiKeyFor(profileId: String): Boolean = getApiKeyFor(profileId).isNotBlank()

    fun setApiKey(value: String) {
        ensureProfilesMigrated()
        val key = activeProfile()?.credentialKey() ?: "apiKey"
        storeApiKey(key, value)
        notifyChanged()
    }

    fun setApiKeyFor(profileId: String, value: String) {
        ensureProfilesMigrated()
        val profile = state.profiles.firstOrNull { it.id == profileId } ?: return
        storeApiKey(profile.credentialKey(), value)
        notifyChanged()
    }

    fun clearApiKeyForProfile(profileId: String) {
        ensureProfilesMigrated()
        val profile = state.profiles.firstOrNull { it.id == profileId } ?: return
        clearApiKeyFor(profile.credentialKey())
        notifyChanged()
    }

    fun applyValidated(
        candidate: State,
        apiKey: String,
    ): List<String> {
        val profiles = candidate.profiles.map { it.copy() }.toMutableList()
        var activeId = candidate.activeProfileId.ifBlank { state.activeProfileId }
        if (profiles.none { it.id == activeId }) {
            activeId = profiles.firstOrNull()?.id.orEmpty()
        }
        // When no profiles remain, force blank connection on flat state (ignore stale form).
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
                    fimPath = empty.fimPath,
                    chatPath = empty.chatPath,
                    completionsPath = empty.completionsPath,
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
                )
            }
        val errors = validate(normalized)
        if (errors.isNotEmpty()) return errors
        state = normalized
        // Write flat fields into the active profile snapshot when one is selected.
        syncActiveProfileFromFlat()
        if (profiles.isEmpty()) {
            storeApiKey("apiKey", "")
        } else {
            val credKey = activeProfile()?.credentialKey() ?: "apiKey"
            storeApiKey(credKey, apiKey)
        }
        notifyChanged()
        return emptyList()
    }

    fun providerConfig(): ProviderConfig {
        ensureProfilesMigrated()
        val kind = ProviderKind.normalize(state.provider)
        val style =
            runCatching { RequestStyle.valueOf(state.requestStyle) }
                .getOrDefault(RequestStyle.AUTO)
        val template = resolveStoredTemplate()
        return ProviderConfig(
            kind = kind,
            baseUrl = state.baseUrl.trim(),
            apiKey = getApiKey(),
            model = state.model.trim(),
            authHeaderTemplate = state.authHeaderTemplate,
            extraHeadersJson = state.extraHeadersJson,
            fimPath = state.fimPath.trim(),
            chatPath = state.chatPath.trim().ifBlank { "/chat/completions" },
            completionsPath = state.completionsPath.trim(),
            requestStyle = style,
            promptTemplate = template,
            temperature = state.temperature,
            maxTokens = state.maxTokens,
            timeoutMs = state.timeoutMs,
            settingsTimeoutMs = state.settingsTimeoutMs,
            stream = state.stream,
            // Remote endpoints always allowed (UI switch removed).
            allowRemote = true,
        )
    }

    fun resolveStoredTemplate(): PromptTemplate {
        val raw = state.promptTemplate.trim()
        if (raw.isNotEmpty() && raw != PromptTemplate.AUTO.name) {
            return PromptTemplate.fromStored(raw)
        }
        if (raw.isEmpty() && state.requestStyle in setOf(RequestStyle.FIM.name, RequestStyle.CHAT.name)) {
            return PromptTemplate.fromLegacyRequestStyle(state.requestStyle)
        }
        return PromptTemplate.fromStored(raw.ifEmpty { PromptTemplate.AUTO.name })
    }

    fun validate(candidate: State = state): List<String> =
        SettingsValidation.validate(
            baseUrl = candidate.baseUrl,
            model = candidate.model,
            timeoutMs = candidate.timeoutMs,
            settingsTimeoutMs = candidate.settingsTimeoutMs,
            maxTokens = candidate.maxTokens,
            maxPrefixChars = candidate.maxPrefixChars,
            maxSuffixChars = candidate.maxSuffixChars,
            allowRemote = candidate.allowRemote,
            extraHeadersJson = candidate.extraHeadersJson,
            // No saved profile → blank endpoint is intentional (user deleted all / never created).
            requireConnection = candidate.profiles.isNotEmpty(),
        )

    /**
     * One-time migration from pre-profile settings. After bootstrap, empty list is allowed.
     */
    fun ensureProfilesMigrated() {
        if (!state.profilesBootstrapped) {
            state.profilesBootstrapped = true
            if (state.profiles.isEmpty()) {
                val hasConnection = state.baseUrl.isNotBlank() || state.model.isNotBlank()
                val legacyKey = PasswordSafe.instance.getPassword(legacyCredentialAttributes()).orEmpty()
                if (hasConnection || legacyKey.isNotEmpty()) {
                    val name =
                        ProviderProfile.uniqueName(
                            suggestNameFromEndpoint(state.baseUrl, state.model),
                            emptyList(),
                        )
                    val profile = ProviderProfile(name = name).also { copyFlatToProfile(it) }
                    profile.name = name
                    state.profiles.add(profile)
                    state.activeProfileId = profile.id
                    if (legacyKey.isNotEmpty()) {
                        storeApiKey(profile.credentialKey(), legacyKey)
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

    private fun applyEmptyConnectionToFlat() {
        val empty = ProviderProfile.empty()
        applyProfileToFlat(empty)
    }

    private fun syncActiveProfileFromFlat() {
        val profile = state.profiles.firstOrNull { it.id == state.activeProfileId } ?: return
        val name = profile.name
        // Collapse legacy provider kind before writing into the profile snapshot.
        state.provider = ProviderKind.normalize(state.provider).name
        copyFlatToProfile(profile)
        profile.name = name
    }

    private fun applyProfileToFlat(profile: ProviderProfile) {
        state.provider = ProviderKind.normalize(profile.provider).name
        state.baseUrl = profile.baseUrl
        state.model = profile.model
        state.authHeaderTemplate = profile.authHeaderTemplate
        state.extraHeadersJson = profile.extraHeadersJson
        state.fimPath = profile.fimPath
        state.chatPath = profile.chatPath
        state.completionsPath = profile.completionsPath
        state.requestStyle = profile.requestStyle
        state.promptTemplate = profile.promptTemplate
        state.temperature = profile.temperature
        state.maxTokens = profile.maxTokens
        state.timeoutMs = profile.timeoutMs
        state.settingsTimeoutMs = profile.settingsTimeoutMs
        state.stream = profile.stream
        state.allowRemote = profile.allowRemote
        state.overrideContextBudget = profile.overrideContextBudget
        state.profileMaxPrefixChars = profile.maxPrefixChars
        state.profileMaxSuffixChars = profile.maxSuffixChars
    }

    private fun copyFlatToProfile(profile: ProviderProfile) {
        profile.provider = state.provider
        profile.baseUrl = state.baseUrl
        profile.model = state.model
        profile.authHeaderTemplate = state.authHeaderTemplate
        profile.extraHeadersJson = state.extraHeadersJson
        profile.fimPath = state.fimPath
        profile.chatPath = state.chatPath
        profile.completionsPath = state.completionsPath
        profile.requestStyle = state.requestStyle
        profile.promptTemplate = state.promptTemplate
        profile.temperature = state.temperature
        profile.maxTokens = state.maxTokens
        profile.timeoutMs = state.timeoutMs
        profile.settingsTimeoutMs = state.settingsTimeoutMs
        profile.stream = state.stream
        profile.allowRemote = state.allowRemote
        profile.overrideContextBudget = state.overrideContextBudget
        profile.maxPrefixChars = state.profileMaxPrefixChars
        profile.maxSuffixChars = state.profileMaxSuffixChars
    }

    /** Effective prefix budget: profile override when enabled, else Performance tab. */
    fun effectiveMaxPrefixChars(): Int =
        if (state.overrideContextBudget) state.profileMaxPrefixChars else state.maxPrefixChars

    /** Effective suffix budget: profile override when enabled, else Performance tab. */
    fun effectiveMaxSuffixChars(): Int =
        if (state.overrideContextBudget) state.profileMaxSuffixChars else state.maxSuffixChars

    private fun storeApiKey(
        credentialKey: String,
        value: String,
    ) {
        val attrs = credentialAttributes(credentialKey)
        if (value.isBlank()) {
            PasswordSafe.instance.set(attrs, null)
        } else {
            PasswordSafe.instance.set(attrs, Credentials("auto-complete", value))
        }
    }

    private fun clearApiKeyFor(credentialKey: String) {
        PasswordSafe.instance.set(credentialAttributes(credentialKey), null)
    }

    private fun credentialAttributes(key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName("AutoComplete", key))

    private fun legacyCredentialAttributes(): CredentialAttributes =
        CredentialAttributes(generateServiceName("AutoComplete", "apiKey"))

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
