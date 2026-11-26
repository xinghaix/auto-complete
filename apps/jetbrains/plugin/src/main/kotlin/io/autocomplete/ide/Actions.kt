package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.InlineCompletion
import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.engine.CompletionOutcome
import io.autocomplete.i18n.message
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.ui.AcUiEntry
import io.autocomplete.ui.SettingsWebToolWindowFactory

class TriggerCompletionAction :
    AnAction(),
    DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabled = editor != null && !editor.isDisposed
    }

    override fun actionPerformed(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        if (editor.isDisposed) return
        val project = e.project
        val app = AutoCompleteAppService.getInstance()
        try {
            val handler = InlineCompletion.getHandlerOrNull(editor)
            if (handler != null) {
                // Explicit 3-arg constructor avoids Kotlin DefaultConstructorMarker binary fragility.
                handler.invokeEvent(
                    InlineCompletionEvent.DirectCall(editor, editor.caretModel.currentCaret, e.dataContext),
                )
                return
            }
        } catch (_: Throwable) {
            // fall through to manual completion fallback
        }
        val expectedStamp = editor.document.modificationStamp
        val expectedOffset = editor.caretModel.offset
        val request =
            ManualCompletion.buildRequest(
                editor.document,
                expectedOffset,
                project,
            )
        app.engine.completeAsync(request, debounce = false) { outcome ->
            handleManualOutcome(outcome, app, project, editor, expectedStamp, expectedOffset)
        }
    }

    private fun handleManualOutcome(
        outcome: CompletionOutcome,
        app: AutoCompleteAppService,
        project: Project?,
        editor: Editor,
        expectedStamp: Long,
        expectedOffset: Int,
    ) {
        when (outcome) {
            is CompletionOutcome.Success -> {
                app.uiState.onSuccess(
                    outcome.response.latencyMs,
                    outcome.response.model,
                    outcome.response.cached,
                )
                ApplicationManager.getApplication().invokeLater({
                    if (editor.isDisposed) return@invokeLater
                    if (project != null && project.isDisposed) return@invokeLater
                    val doc = editor.document
                    if (doc.modificationStamp != expectedStamp) return@invokeLater
                    if (editor.caretModel.offset != expectedOffset) return@invokeLater
                    if (expectedOffset < 0 || expectedOffset > doc.textLength) return@invokeLater
                    WriteCommandAction.runWriteCommandAction(project) {
                        if (doc.modificationStamp != expectedStamp) return@runWriteCommandAction
                        doc.insertString(expectedOffset, outcome.response.text)
                        editor.caretModel.moveToOffset(expectedOffset + outcome.response.text.length)
                    }
                    app.engine.recordAccepted()
                    app.uiState.onAccepted()
                }, ModalityState.defaultModalityState())
            }
            is CompletionOutcome.Failed -> {
                app.uiState.onError(outcome.message)
                ApplicationManager.getApplication().invokeLater({
                    if (project != null && project.isDisposed) return@invokeLater
                    Messages.showErrorDialog(
                        project,
                        outcome.message.ifBlank { message("completion.failed") },
                        message("name"),
                    )
                }, ModalityState.any())
            }
            else -> Unit
        }
    }
}

class ToggleEnabledAction :
    AnAction(),
    DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val settings = AutoCompleteSettingsService.getInstance()
        settings.update { enabled = !enabled }
        AutoCompleteAppService.getInstance().uiState.refresh()
    }
}

class SnoozeAction :
    AnAction(),
    DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
    }

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
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AcUiEntry.openSettings(project)
        SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_CONFIG)
    }
}

/** Open the same Web panel on Logs tab (no separate Logs tool window). */
class OpenLogsAction :
    AnAction(),
    DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AcUiEntry.openLogs(project)
        SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_LOGS)
    }
}

class CancelCompletionsAction :
    AnAction(),
    DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
    }

    override fun actionPerformed(e: AnActionEvent) {
        AutoCompleteAppService.getInstance().engine.cancelAll()
        AutoCompleteAppService.getInstance().uiState.refresh()
    }
}
