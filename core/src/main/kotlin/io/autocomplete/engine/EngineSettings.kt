package io.autocomplete.engine

import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.RequestStyle
import io.autocomplete.util.IgnoreRules

data class EngineSettings(
    val enabled: Boolean = true,
    val autoTrigger: Boolean = true,
    val snoozed: Boolean = false,
    val model: String = "test-model",
    val disabledLanguages: Set<String> = emptySet(),
    val maxFileSizeKb: Int = 512,
    val respectGitignore: Boolean = true,
    val ignoreGlobs: List<String> = IgnoreRules.DEFAULT_GLOBS,
    val validationErrors: List<String> = emptyList(),
    val firstLineOnlyWhenMidLine: Boolean = true,
    val enableInComments: Boolean = true,
    val enableInStrings: Boolean = true,
    val debounceMinMs: Int = 150,
    val debounceInitialMs: Int = 300,
    val debounceMaxMs: Int = 1000,
    val maxPrefixChars: Int = 8000,
    val maxSuffixChars: Int = 2000,
    val maxTokens: Int = 128,
    val temperature: Double = 0.0,
    val stream: Boolean = false,
    val sendFilePath: Boolean = true,
    val enableRecentFileContext: Boolean = false,
    val recentFileLimit: Int = 3,
    val recentFileMaxChars: Int = 1200,
    val cacheSize: Int = 20,
    val lruSize: Int = 64,
    val maxInFlight: Int = 1,
    val logRetention: Int = 1000,
    val logLevel: String = "info",
    val logPromptBodies: Boolean = false,
    val notifyOnFatalError: Boolean = true,
    val showCostApprox: Boolean = false,
    val providerConfig: ProviderConfig =
        ProviderConfig(
            kind = ProviderKind.OPENAI_COMPATIBLE,
            baseUrl = "http://127.0.0.1:9/v1",
            apiKey = "",
            model = "test-model",
            requestStyle = RequestStyle.CHAT,
            timeoutMs = 1000,
        ),
) {
    fun isEnabledNow(): Boolean = enabled && !snoozed
}

fun interface SettingsSource {
    fun current(): EngineSettings
}
