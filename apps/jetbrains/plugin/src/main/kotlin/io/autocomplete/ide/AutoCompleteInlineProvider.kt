package io.autocomplete.ide

import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.codeInsight.inline.completion.InlineCompletionProvider
import com.intellij.codeInsight.inline.completion.InlineCompletionProviderID
import com.intellij.codeInsight.inline.completion.InlineCompletionRequest
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionElement
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionGrayTextElement
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionSingleSuggestion
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionSuggestion
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionVariant
import com.intellij.openapi.application.readAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.engine.CompletionOutcome
import io.autocomplete.engine.CompletionRequest
import io.autocomplete.engine.ContextHints
import io.autocomplete.engine.InlineTriggerPolicy
import io.autocomplete.engine.Trigger
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.util.ContextProbe
import io.autocomplete.util.IgnoreRules
import io.autocomplete.util.LanguageMap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
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

    override suspend fun getSuggestion(request: InlineCompletionRequest): InlineCompletionSuggestion {
        val app = AutoCompleteAppService.getInstance()
        val settings = AutoCompleteSettingsService.getInstance()
        val s = settings.snapshot()
        val directCall = request.event is InlineCompletionEvent.DirectCall
        val triggerDecision =
            InlineTriggerPolicy.decide(
                enabledNow = settings.isEnabledNow(),
                autoTrigger = s.autoTrigger,
                directCall = directCall,
            )
        if (!triggerDecision.enabled) {
            return InlineCompletionSuggestion.Empty
        }

        val disabledLanguages = settings.disabledLanguageSet()
        val maxFileSizeBytes = s.maxFileSizeKb.toLong().coerceAtLeast(1L) * 1024L
        val effectivePrefix = settings.effectiveMaxPrefixChars()
        val effectiveSuffix = settings.effectiveMaxSuffixChars()
        val ignoreGlobs = settings.ignoreGlobList()
        val needContextProbe = !s.enableInComments || !s.enableInStrings

        val snapshot =
            readAction {
                val editor = request.editor
                if (editor.isDisposed) return@readAction null
                val project = editor.project
                if (project != null && project.isDisposed) return@readAction null
                val document = editor.document
                // Cheap file-size gate before copying any text from the document.
                if (document.textLength.toLong() > maxFileSizeBytes) return@readAction null

                val vf = FileDocumentManager.getInstance().getFile(document)
                val path = vf?.path.orEmpty()
                val language = LanguageMap.normalize(vf?.fileType?.name, path)
                if (language.lowercase() in disabledLanguages) return@readAction null

                val projectKey = project?.locationHash.orEmpty()
                if (path.isNotBlank()) {
                    val slashPath = path.replace('\\', '/')
                    val basePath = project?.basePath?.replace('\\', '/')?.trimEnd('/')
                    val relPath =
                        if (!basePath.isNullOrEmpty() && slashPath.startsWith("$basePath/")) {
                            slashPath.removePrefix("$basePath/")
                        } else {
                            null
                        }
                    val ignoreRules =
                        IgnoreRules(
                            globs = ignoreGlobs,
                            respectGitignore = s.respectGitignore,
                            gitignorePatterns = app.projectContexts.gitignorePatterns(projectKey),
                        )
                    if (ignoreRules.isIgnored(slashPath, relPath)) return@readAction null
                }

                snapSliced(
                    document = document,
                    offset = request.endOffset,
                    project = project,
                    path = path,
                    language = language,
                    maxPrefixChars = effectivePrefix,
                    maxSuffixChars = effectiveSuffix,
                    runContextProbe = needContextProbe,
                )
            } ?: return InlineCompletionSuggestion.Empty

        val scope = snapshot.path.ifBlank { "untitled" }
        val gen = app.engine.nextGeneration(scope)
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
                forceRefresh = directCall,
            )

        val outcome =
            suspendCancellableCoroutine { cont ->
                app.engine.completeAsync(req, debounce = triggerDecision.debounce) { result ->
                    if (cont.isActive) cont.resume(result)
                }
                cont.invokeOnCancellation {
                    app.engine.cancelScope(scope, req.id)
                }
            }

        return when (outcome) {
            is CompletionOutcome.Success -> {
                if (outcome.response.generation != app.engine.currentGeneration(scope)) {
                    InlineCompletionSuggestion.Empty
                } else {
                    app.uiState.onSuccess(
                        outcome.response.latencyMs,
                        outcome.response.model,
                        outcome.response.cached,
                    )
                    SingleTextSuggestion(outcome.response.text)
                }
            }
            is CompletionOutcome.Failed -> {
                app.uiState.onError(outcome.message)
                InlineCompletionSuggestion.Empty
            }
            else -> InlineCompletionSuggestion.Empty
        }
    }

    /**
     * Explicit [InlineCompletionSingleSuggestion] implementation that avoids
     * Kotlin `$default` synthetic bridge signatures on `InlineCompletionSingleSuggestion.Companion.build`.
     */
    private class SingleTextSuggestion(
        private val text: String,
    ) : InlineCompletionSingleSuggestion {
        override suspend fun getVariant(): InlineCompletionVariant =
            object : InlineCompletionVariant {
                override val data: UserDataHolderBase = UserDataHolderBase()
                override val elements: Flow<InlineCompletionElement> =
                    flowOf(InlineCompletionGrayTextElement(text))
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
        private const val WINDOW_MARGIN_CHARS = 2048

        fun snap(
            document: Document,
            offset: Int,
            project: Project?,
        ): DocSnap {
            val settings = AutoCompleteSettingsService.getInstance()
            val s = settings.snapshot()
            val vf = FileDocumentManager.getInstance().getFile(document)
            val path = vf?.path.orEmpty()
            val language = LanguageMap.normalize(vf?.fileType?.name, path)
            return snapSliced(
                document = document,
                offset = offset,
                project = project,
                path = path,
                language = language,
                maxPrefixChars = settings.effectiveMaxPrefixChars(),
                maxSuffixChars = settings.effectiveMaxSuffixChars(),
                runContextProbe = !s.enableInComments || !s.enableInStrings,
            )
        }

        internal fun snapSliced(
            document: Document,
            offset: Int,
            project: Project?,
            path: String,
            language: String,
            maxPrefixChars: Int,
            maxSuffixChars: Int,
            runContextProbe: Boolean,
        ): DocSnap {
            val chars = document.immutableCharSequence
            val length = chars.length
            val safe = offset.coerceIn(0, length)
            val prefixWindow = (maxPrefixChars.coerceAtLeast(0) + WINDOW_MARGIN_CHARS)
            val suffixWindow = (maxSuffixChars.coerceAtLeast(0) + WINDOW_MARGIN_CHARS)
            val prefixStart = (safe - prefixWindow).coerceAtLeast(0)
            val suffixEnd = (safe + suffixWindow).coerceAtMost(length)
            val prefix = chars.subSequence(prefixStart, safe).toString()
            val suffix = chars.subSequence(safe, suffixEnd).toString()
            val context =
                if (runContextProbe) {
                    val probe = ContextProbe.inspect(prefix, language)
                    ContextHints(inComment = probe.inComment, inString = probe.inString)
                } else {
                    ContextHints()
                }
            return DocSnap(
                path = path,
                language = language,
                prefix = prefix,
                suffix = suffix,
                offset = safe,
                size = length.toLong(),
                project = project,
                context = context,
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
        val scope = snapshot.path.ifBlank { "untitled" }
        return CompletionRequest(
            id = app.engine.newRequestId(),
            path = snapshot.path,
            language = snapshot.language,
            prefix = snapshot.prefix,
            suffix = snapshot.suffix,
            offset = snapshot.offset,
            trigger = Trigger.MANUAL,
            generation = app.engine.nextGeneration(scope),
            fileSizeBytes = snapshot.size,
            context = snapshot.context,
            projectKey = snapshot.project?.locationHash.orEmpty(),
            forceRefresh = true,
        )
    }
}
