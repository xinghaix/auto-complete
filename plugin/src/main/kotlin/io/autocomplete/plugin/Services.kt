package io.autocomplete.plugin

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.project.ProjectManagerListener
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.context.ProjectContextProvider
import io.autocomplete.context.ScopedAttachmentRegistry
import io.autocomplete.engine.CompletionEngine
import io.autocomplete.i18n.message
import io.autocomplete.log.LogBuffer
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.net.IdeHttpSupport
import io.autocomplete.ui.UiState
import io.autocomplete.util.IgnoreRules
import java.nio.charset.StandardCharsets

@Service(Service.Level.APP)
class AutoCompleteAppService : Disposable {
    val logs = LogBuffer()
    val projectContexts = ProjectContextProvider()
    val uiState = UiState()
    val engine: CompletionEngine
    private val ideaLog = Logger.getInstance(AutoCompleteAppService::class.java)

    init {
        // Dual-write every accepted log line to idea.log (Help → Show Log).
        logs.addListener { entry ->
            val line = entry.summary()
            when (entry.level) {
                LogLevel.ERROR -> ideaLog.error(line)
                LogLevel.WARN -> ideaLog.warn(line)
                else -> ideaLog.info(line)
            }
        }
        ideaLog.info("Auto Complete log bridge ready (buffer + idea.log)")
        val settings = AutoCompleteSettingsService.getInstance()
        logs.setRetention(settings.snapshot().logRetention)
        engine =
            CompletionEngine(
                settings = ServiceSettingsSource(settings),
                logs = logs,
                projectContexts = projectContexts,
                httpClientProvider = { IdeHttpSupport.createClient() },
                onFatal = { status, message ->
                    ApplicationManager.getApplication().invokeLater {
                        uiState.onError(message.ifBlank { "HTTP $status" })
                        if (settings.snapshot().notifyOnFatalError) {
                            NotificationGroupManager.getInstance()
                                .getNotificationGroup("Auto Complete")
                                .createNotification(
                                    message("notification.authError.title"),
                                    message.ifBlank { "HTTP $status" },
                                    NotificationType.ERROR,
                                ).notify(null)
                        }
                    }
                },
            )
        settings.addListener {
            logs.setRetention(settings.snapshot().logRetention)
            engine.reloadCaches()
            uiState.refresh()
            ProjectManager.getInstance().openProjects.forEach { ProjectSupport.refreshRecent(it) }
        }
        engine.reloadCaches()
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ProjectManager.TOPIC,
            object : ProjectManagerListener {
                override fun projectOpened(project: Project) {
                    ProjectSupport.attach(project)
                }

                override fun projectClosed(project: Project) {
                    ProjectSupport.detach(project)
                }
            },
        )
        // Do NOT call ProjectSupport.attach synchronously here: attach → getInstance()
        // re-enters this constructor and throws CycleInitializationException, which
        // breaks LogPanel, status bar, and settings.
        ApplicationManager.getApplication().invokeLater(
            {
                if (ApplicationManager.getApplication().isDisposed) return@invokeLater
                ProjectManager.getInstance().openProjects.forEach { ProjectSupport.attach(it) }
            },
            ModalityState.any(),
        )
    }

    override fun dispose() {
        engine.dispose()
    }

    companion object {
        fun getInstance(): AutoCompleteAppService =
            ApplicationManager.getApplication().getService(AutoCompleteAppService::class.java)
    }
}

@Service(Service.Level.PROJECT)
class AutoCompleteProjectService(
    private val project: Project,
) : Disposable {
    val app: AutoCompleteAppService = AutoCompleteAppService.getInstance()

    init {
        ProjectSupport.attach(project)
    }

    override fun dispose() {
        ProjectSupport.detach(project)
    }

    companion object {
        fun getInstance(project: Project): AutoCompleteProjectService =
            project.getService(AutoCompleteProjectService::class.java)
    }
}

object ProjectSupport {
    private val attached = ScopedAttachmentRegistry<String, Project> { it.isDisposed }

    fun attach(project: Project) {
        val key = project.locationHash
        if (!attached.attach(key, project)) return
        AutoCompleteAppService.getInstance().projectContexts.clear(key)
        log(project, LogLevel.DEBUG, "project_attach", "project attached")
        reloadGitignore(project)
        refreshRecent(project)

        project.messageBus.connect(project).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    refreshRecent(project)
                }

                override fun fileOpened(
                    source: FileEditorManager,
                    file: VirtualFile,
                ) {
                    refreshRecent(project)
                }
            },
        )
    }

    fun detach(project: Project) {
        val key = project.locationHash
        if (!attached.detach(key, project)) return
        AutoCompleteAppService.getInstance().projectContexts.clear(key)
        log(project, LogLevel.DEBUG, "project_detach", "project detached")
    }

    private fun isCurrent(project: Project): Boolean =
        attached.isCurrent(project.locationHash, project)

    fun reloadGitignore(project: Project) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val patterns = mutableListOf<String>()
            val basePath = project.basePath
            if (!basePath.isNullOrBlank()) {
                val base = VfsUtil.findFileByIoFile(java.io.File(basePath), true)
                val gi = base?.findChild(".gitignore")
                if (gi != null && gi.isValid && !gi.isDirectory) {
                    val text =
                        runCatching { VfsUtil.loadText(gi) }
                            .getOrElse {
                                runCatching { String(gi.contentsToByteArray(), StandardCharsets.UTF_8) }.getOrDefault("")
                            }
                    patterns += IgnoreRules.parseGitignore(text)
                }
            }
            if (isCurrent(project)) {
                AutoCompleteAppService.getInstance().projectContexts.updateGitignorePatterns(
                    project.locationHash,
                    patterns,
                )
                log(project, LogLevel.DEBUG, "gitignore_reload", "patterns=${patterns.size}")
            }
        }
    }

    fun refreshRecent(project: Project) {
        val settings = AutoCompleteSettingsService.getInstance().snapshot()
        if (!settings.enableRecentFileContext) {
            if (isCurrent(project)) {
                AutoCompleteAppService.getInstance().projectContexts.updateRecentSnippets(
                    project.locationHash,
                    emptyList(),
                )
                log(project, LogLevel.DEBUG, "recent_context", "disabled; snippets cleared")
            }
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            val mgr = FileEditorManager.getInstance(project)
            val files = mgr.openFiles.toList()
            val snippets = mutableListOf<String>()
            val limit = settings.recentFileLimit.coerceAtLeast(0)
            val maxChars = settings.recentFileMaxChars.coerceAtLeast(0)
            for (file in files.take(limit)) {
                if (!file.isValid || file.isDirectory) continue
                val text =
                    runCatching {
                        VfsUtil.loadText(file)
                    }.getOrNull() ?: continue
                val clipped = text.take(maxChars)
                if (clipped.isNotBlank()) {
                    snippets += "File: ${file.path}\n$clipped"
                }
            }
            if (isCurrent(project)) {
                AutoCompleteAppService.getInstance().projectContexts.updateRecentSnippets(
                    project.locationHash,
                    snippets,
                )
                log(project, LogLevel.DEBUG, "recent_context", "snippets=${snippets.size}")
            }
        }
    }

    private fun log(
        project: Project,
        level: LogLevel,
        operation: String,
        message: String,
    ) {
        val app = AutoCompleteAppService.getInstance()
        app.logs.appendIfEnabled(
            LogEntry(
                level = level,
                file = project.basePath.orEmpty(),
                trigger = "PROJECT",
                operation = operation,
                message = message,
            ),
            AutoCompleteSettingsService.getInstance().snapshot().logLevel,
        )
    }
}
