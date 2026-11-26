package io.autocomplete.plugin

import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.engine.EngineSettings
import io.autocomplete.engine.SettingsSource

class ServiceSettingsSource(
    private val service: AutoCompleteSettingsService,
) : SettingsSource {
    override fun current(): EngineSettings {
        val s = service.snapshot()
        return EngineSettings(
            enabled = s.enabled,
            autoTrigger = s.autoTrigger,
            snoozed = s.snoozeUntil > System.currentTimeMillis(),
            model = s.model,
            disabledLanguages = service.disabledLanguageSet(),
            maxFileSizeKb = s.maxFileSizeKb,
            respectGitignore = s.respectGitignore,
            ignoreGlobs = service.ignoreGlobList(),
            validationErrors = service.validateState(s),
            firstLineOnlyWhenMidLine = s.firstLineOnlyWhenMidLine,
            enableInComments = s.enableInComments,
            enableInStrings = s.enableInStrings,
            debounceMinMs = s.debounceMinMs,
            debounceInitialMs = s.debounceInitialMs,
            debounceMaxMs = s.debounceMaxMs,
            maxPrefixChars = if (s.overrideContextBudget) s.profileMaxPrefixChars else s.maxPrefixChars,
            maxSuffixChars = if (s.overrideContextBudget) s.profileMaxSuffixChars else s.maxSuffixChars,
            maxTokens = s.maxTokens,
            temperature = s.temperature,
            stream = s.stream,
            sendFilePath = s.sendFilePath,
            enableRecentFileContext = s.enableRecentFileContext,
            recentFileLimit = s.recentFileLimit,
            recentFileMaxChars = s.recentFileMaxChars,
            cacheSize = s.cacheSize,
            lruSize = s.lruSize,
            maxInFlight = s.maxInFlight,
            logRetention = s.logRetention,
            logLevel = s.logLevel,
            logPromptBodies = s.logPromptBodies,
            notifyOnFatalError = s.notifyOnFatalError,
            showCostApprox = s.showCostApprox,
            providerConfig = service.providerConfig(),
        )
    }
}
