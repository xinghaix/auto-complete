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
            snoozed = service.isSnoozed(),
            model = s.model,
            disabledLanguages = service.disabledLanguageSet(),
            maxFileSizeKb = s.maxFileSizeKb,
            respectGitignore = s.respectGitignore,
            ignoreGlobs = service.ignoreGlobList(),
            validationErrors = service.validate(),
            firstLineOnlyWhenMidLine = s.firstLineOnlyWhenMidLine,
            enableInComments = s.enableInComments,
            enableInStrings = s.enableInStrings,
            debounceMinMs = s.debounceMinMs,
            debounceInitialMs = s.debounceInitialMs,
            debounceMaxMs = s.debounceMaxMs,
            maxPrefixChars = service.effectiveMaxPrefixChars(),
            maxSuffixChars = service.effectiveMaxSuffixChars(),
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
