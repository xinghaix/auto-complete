package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.InlineCompletion
import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.engine.CompletionOutcome
import io.autocomplete.i18n.message
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.ui.AcUiEntry
import io.autocomplete.ui.SettingsWebToolWindowFactory

class TriggerCompletionAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val project = e.project
        val app = AutoCompleteAppService.getInstance()
        try {
            val handler = InlineCompletion.getHandlerOrNull(editor)
            if (handler != null) {
                handler.invokeEvent(
                    InlineCompletionEvent.DirectCall(editor, editor.caretModel.currentCaret),
                )
                return
            }
        } catch (_: Throwable) {
            // fall through
        }
        val request =
            ManualCompletion.buildRequest(
                editor.document,
                editor.caretModel.offset,
                project,
            )
        app.engine.completeAsync(request, debounce = false) { outcome ->
            handleManualOutcome(outcome, app, project, editor)
        }
    }

    private fun handleManualOutcome(
        outcome: CompletionOutcome,
        app: AutoCompleteAppService,
        project: Project?,
        editor: Editor,
    ) {
        when (outcome) {
            is CompletionOutcome.Success -> {
                ApplicationManager.getApplication().runWriteAction {
                    val offset = editor.caretModel.offset
                    editor.document.insertString(offset, outcome.response.text)
                    editor.caretModel.moveToOffset(offset + outcome.response.text.length)
                }
                app.uiState.onSuccess(
                    outcome.response.latencyMs,
                    outcome.response.model,
                    outcome.response.cached,
                )
            }
            is CompletionOutcome.Failed -> {
                app.uiState.onError(outcome.message)
                ApplicationManager.getApplication().invokeLater {
                    Messages.showErrorDialog(
                        project,
                        outcome.message.ifBlank { message("completion.failed") },
                        message("name"),
                    )
                }
            }
            else -> Unit
        }
    }
}

class ToggleEnabledAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val settings = AutoCompleteSettingsService.getInstance()
        settings.update { enabled = !enabled }
        AutoCompleteAppService.getInstance().uiState.refresh()
    }
}

class SnoozeAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val settings = AutoCompleteSettingsService.getInstance()
        if (settings.isSnoozed()) settings.unsnooze() else settings.snooze(30)
        AutoCompleteAppService.getInstance().uiState.refresh()
    }
}

/** Open unified Web panel on Settings tab (only product settings entry). */
class OpenSettingsAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AcUiEntry.openSettings()
        SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_CONFIG)
    }
}

/** Open the same Web panel on Logs tab (no separate Logs tool window). */
class OpenLogsAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AcUiEntry.openLogs()
        SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_LOGS)
    }
}

class CancelCompletionsAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        AutoCompleteAppService.getInstance().engine.cancelAll()
        AutoCompleteAppService.getInstance().uiState.refresh()
    }
}
