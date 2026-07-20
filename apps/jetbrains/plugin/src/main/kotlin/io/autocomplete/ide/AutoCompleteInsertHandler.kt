package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.DefaultInlineCompletionInsertHandler
import com.intellij.codeInsight.inline.completion.InlineCompletionInsertEnvironment
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionElement
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.plugin.AutoCompleteAppService

class AutoCompleteInsertHandler : DefaultInlineCompletionInsertHandler() {
    override fun afterInsertion(
        environment: InlineCompletionInsertEnvironment,
        elements: List<InlineCompletionElement>,
    ) {
        val app = AutoCompleteAppService.getInstance()
        app.logs.appendIfEnabled(
            LogEntry(
                level = LogLevel.INFO,
                file = AutoCompleteInlineProvider.lastPath,
                trigger = "ACCEPT",
                operation = "completion_accept",
                message = "accepted chars=${AutoCompleteInlineProvider.lastSuggestion.length}",
            ),
            AutoCompleteSettingsService.getInstance().snapshot().logLevel,
        )
        app.uiState.onAccepted()
    }
}
