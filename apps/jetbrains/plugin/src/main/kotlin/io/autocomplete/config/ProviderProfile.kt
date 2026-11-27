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
        const val DEFAULT_NAME = "New Profile"

        /** Brand-new empty connection (no copy of current form). */
        fun empty(name: String = DEFAULT_NAME): ProviderProfile =
            ProviderProfile(name = name)

        /**
         * Create a preset-seeded profile (never includes API keys or secrets).
         * Accepts both short UI preset ids (`ollama`, `deepseek`, `mistral`, `vllm`)
         * and descriptive aliases (`deepseek-beta`, `mistral-codestral`, `vllm-lmstudio`).
         */
        fun fromPreset(
            preset: String?,
            name: String,
        ): ProviderProfile =
            when (preset?.trim()?.lowercase().orEmpty()) {
                "ollama", "ollama-local" ->
                    ProviderProfile(
                        name = name,
                        baseUrl = "http://127.0.0.1:11434/v1",
                        promptTemplate = PromptTemplate.AUTO.name,
                        fimPath = "",
                        chatPath = "/chat/completions",
                        completionsPath = "",
                    )
                "deepseek", "deepseek-beta", "deepseek-fim" ->
                    ProviderProfile(
                        name = name,
                        baseUrl = "https://api.deepseek.com/beta",
                        promptTemplate = PromptTemplate.CODESTRAL_API.name,
                        fimPath = "/completions",
                        chatPath = "/chat/completions",
                        completionsPath = "",
                    )
                "mistral", "mistral-codestral", "codestral" ->
                    ProviderProfile(
                        name = name,
                        baseUrl = "https://codestral.mistral.ai/v1",
                        promptTemplate = PromptTemplate.CODESTRAL_API.name,
                        fimPath = "/fim/completions",
                        chatPath = "/chat/completions",
                        completionsPath = "",
                    )
                "vllm", "vllm-lmstudio", "lmstudio", "lm-studio" ->
                    ProviderProfile(
                        name = name,
                        baseUrl = "http://127.0.0.1:8000/v1",
                        promptTemplate = PromptTemplate.AUTO.name,
                        fimPath = "",
                        chatPath = "/chat/completions",
                        completionsPath = "",
                    )
                else -> empty(name)
            }

        fun defaultNameForPreset(preset: String?): String =
            when (preset?.trim()?.lowercase().orEmpty()) {
                "ollama", "ollama-local" -> "Ollama"
                "deepseek", "deepseek-beta", "deepseek-fim" -> "DeepSeek Beta FIM"
                "mistral", "mistral-codestral", "codestral" -> "Mistral Codestral"
                "vllm", "vllm-lmstudio", "lmstudio", "lm-studio" -> "vLLM / LM Studio"
                else -> DEFAULT_NAME
            }

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
