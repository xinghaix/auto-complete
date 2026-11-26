package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.DefaultInlineCompletionInsertHandler
import com.intellij.codeInsight.inline.completion.InlineCompletionInsertEnvironment
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionElement
import com.intellij.openapi.fileEditor.FileDocumentManager
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.plugin.AutoCompleteAppService

class AutoCompleteInsertHandler : DefaultInlineCompletionInsertHandler() {
    override fun afterInsertion(
        environment: InlineCompletionInsertEnvironment,
        elements: List<InlineCompletionElement>,
    ) {
        super.afterInsertion(environment, elements)
        val app = AutoCompleteAppService.getInstance()
        val acceptedChars = elements.sumOf { it.text.length }
        val filePath =
            FileDocumentManager.getInstance().getFile(environment.editor.document)?.path
                ?: environment.file.virtualFile?.path
                ?: ""
        app.engine.recordAccepted()
        app.logs.appendIfEnabled(
            LogEntry(
                level = LogLevel.INFO,
                file = filePath,
                trigger = "ACCEPT",
                operation = "completion_accept",
                message = "accepted chars=$acceptedChars",
            ),
            AutoCompleteSettingsService.getInstance().snapshot().logLevel,
        )
        app.uiState.onAccepted()
    }
}
