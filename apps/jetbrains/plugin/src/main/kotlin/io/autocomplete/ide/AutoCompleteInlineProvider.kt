package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.codeInsight.inline.completion.InlineCompletionProvider
import com.intellij.codeInsight.inline.completion.InlineCompletionProviderID
import com.intellij.codeInsight.inline.completion.InlineCompletionRequest
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionGrayTextElement
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionSingleSuggestion
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.engine.CompletionOutcome
import io.autocomplete.engine.CompletionRequest
import io.autocomplete.engine.ContextHints
import io.autocomplete.engine.InlineTriggerPolicy
import io.autocomplete.engine.Trigger
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.util.ContextProbe
import io.autocomplete.util.LanguageMap
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class AutoCompleteInlineProvider : InlineCompletionProvider {
    override val id: InlineCompletionProviderID = InlineCompletionProviderID("io.autocomplete.inline")

    override val insertHandler = AutoCompleteInsertHandler()

    override fun isEnabled(event: InlineCompletionEvent): Boolean {
        val settings = AutoCompleteSettingsService.getInstance()
        return InlineTriggerPolicy.decide(
            enabledNow = settings.isEnabledNow(),
            autoTrigger = settings.snapshot().autoTrigger,
            directCall = event is InlineCompletionEvent.DirectCall,
        ).enabled
    }

    override suspend fun getSuggestion(request: InlineCompletionRequest): InlineCompletionSingleSuggestion {
        val app = AutoCompleteAppService.getInstance()
        val settings = AutoCompleteSettingsService.getInstance()
        val triggerDecision =
            InlineTriggerPolicy.decide(
                enabledNow = settings.isEnabledNow(),
                autoTrigger = settings.snapshot().autoTrigger,
                directCall = request.event is InlineCompletionEvent.DirectCall,
            )
        if (!triggerDecision.enabled) {
            return InlineCompletionSingleSuggestion.build { }
        }

        val snapshot =
            ReadAction.compute<DocSnap, RuntimeException> {
                snap(request.editor.document, request.endOffset, request.editor.project)
            }

        val gen = app.engine.nextGeneration()
        val req =
            CompletionRequest(
                id = app.engine.newRequestId(),
                path = snapshot.path,
                language = snapshot.language,
                prefix = snapshot.prefix,
                suffix = snapshot.suffix,
                offset = snapshot.offset,
                trigger = triggerDecision.trigger,
                generation = gen,
                fileSizeBytes = snapshot.size,
                context = snapshot.context,
                projectKey = snapshot.project?.locationHash.orEmpty(),
            )

        val outcome =
            suspendCancellableCoroutine { cont ->
                app.engine.completeAsync(req, debounce = triggerDecision.debounce) { result ->
                    if (cont.isActive) cont.resume(result)
                }
                cont.invokeOnCancellation {
                    app.engine.cancelScope(req.path.ifBlank { "untitled" })
                }
            }

        return when (outcome) {
            is CompletionOutcome.Success -> {
                if (outcome.response.generation != app.engine.currentGeneration()) {
                    InlineCompletionSingleSuggestion.build { }
                } else {
                    lastSuggestion = outcome.response.text
                    lastPath = snapshot.path
                    app.uiState.onSuccess(
                        outcome.response.latencyMs,
                        outcome.response.model,
                        outcome.response.cached,
                    )
                    InlineCompletionSingleSuggestion.build {
                        emit(InlineCompletionGrayTextElement(outcome.response.text))
                    }
                }
            }
            is CompletionOutcome.Failed -> {
                app.uiState.onError(outcome.message)
                InlineCompletionSingleSuggestion.build { }
            }
            else -> InlineCompletionSingleSuggestion.build { }
        }
    }

    data class DocSnap(
        val path: String,
        val language: String,
        val prefix: String,
        val suffix: String,
        val offset: Int,
        val size: Long,
        val project: Project?,
        val context: ContextHints,
    )

    companion object {
        @Volatile
        var lastSuggestion: String = ""

        @Volatile
        var lastPath: String = ""

        fun snap(
            document: Document,
            offset: Int,
            project: Project?,
        ): DocSnap {
            val text = document.immutableCharSequence.toString()
            val safe = offset.coerceIn(0, text.length)
            val prefix = text.substring(0, safe)
            val suffix = text.substring(safe)
            val vf = FileDocumentManager.getInstance().getFile(document)
            val path = vf?.path.orEmpty()
            val language = LanguageMap.normalize(vf?.fileType?.name, path)
            val probe = ContextProbe.inspect(prefix, language)
            return DocSnap(
                path = path,
                language = language,
                prefix = prefix,
                suffix = suffix,
                offset = safe,
                size = text.toByteArray(StandardCharsets.UTF_8).size.toLong(),
                project = project,
                context = ContextHints(inComment = probe.inComment, inString = probe.inString),
            )
        }
    }
}

object ManualCompletion {
    fun buildRequest(
        document: Document,
        offset: Int,
        project: Project?,
    ): CompletionRequest {
        val app = AutoCompleteAppService.getInstance()
        val snapshot = AutoCompleteInlineProvider.snap(document, offset, project)
        return CompletionRequest(
            id = app.engine.newRequestId(),
            path = snapshot.path,
            language = snapshot.language,
            prefix = snapshot.prefix,
            suffix = snapshot.suffix,
            offset = snapshot.offset,
            trigger = Trigger.MANUAL,
            generation = app.engine.nextGeneration(),
            fileSizeBytes = snapshot.size,
            context = snapshot.context,
            projectKey = snapshot.project?.locationHash.orEmpty(),
        )
    }
}
