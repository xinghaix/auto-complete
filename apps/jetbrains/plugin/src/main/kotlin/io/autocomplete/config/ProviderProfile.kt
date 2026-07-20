package io.autocomplete.config

import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.RequestStyle
import io.autocomplete.prompt.PromptTemplate
import java.util.UUID

/**
 * Named, switchable provider connection snapshot.
 * API keys are stored in PasswordSafe under [credentialKey], not in this object.
 */
data class ProviderProfile(
    var id: String = UUID.randomUUID().toString(),
    var name: String = DEFAULT_NAME,
    var provider: String = ProviderKind.OPENAI_COMPATIBLE.name,
    /** Empty for a blank new profile; runtime validation still requires non-blank before use. */
    var baseUrl: String = "",
    var model: String = "",
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
    /**
     * When true, [maxPrefixChars]/[maxSuffixChars] on this profile override the
     * global Performance-tab context budget for completions using this profile.
     */
    var overrideContextBudget: Boolean = false,
    var maxPrefixChars: Int = 8000,
    var maxSuffixChars: Int = 2000,
) {
    fun credentialKey(): String = "apiKey:$id"

    fun isBlankConnection(): Boolean = baseUrl.isBlank() && model.isBlank()

    companion object {
        const val DEFAULT_NAME = "新配置"

        /** Brand-new empty connection (no copy of current form). */
        fun empty(name: String = DEFAULT_NAME): ProviderProfile =
            ProviderProfile(name = name)

        fun uniqueName(
            preferred: String,
            existing: Collection<String>,
        ): String {
            val base = preferred.trim().ifBlank { DEFAULT_NAME }
            val taken =
                existing
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
            if (base !in taken) return base
            var n = 2
            while ("$base $n" in taken) n++
            return "$base $n"
        }
    }
}
