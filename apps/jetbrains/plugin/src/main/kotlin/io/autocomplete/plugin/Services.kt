package io.autocomplete.plugin

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.readAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.context.ProjectContextProvider
import io.autocomplete.context.ScopedAttachmentRegistry
import io.autocomplete.engine.CompletionEngine
import io.autocomplete.i18n.message
import io.autocomplete.log.LogBuffer
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.net.IdeHttpSupport
import io.autocomplete.ui.AutoCompleteStatusBarFactory
import io.autocomplete.ui.UiState
import io.autocomplete.util.IgnoreRules
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicReference

@Service(Service.Level.APP)
class AutoCompleteAppService : Disposable {
    val logs = LogBuffer()
    val projectContexts = ProjectContextProvider()
    val uiState = UiState()
    val engine: CompletionEngine
    private val ideaLog = Logger.getInstance(AutoCompleteAppService::class.java)
    private val httpClientRef = AtomicReference<HttpClient?>(null)
    private val settings: AutoCompleteSettingsService = AutoCompleteSettingsService.getInstance()

    private val ideaLogListener: (LogEntry) -> Unit = { entry ->
        val line = entry.summary()
        when (entry.level) {
            LogLevel.ERROR -> ideaLog.error(line)
            LogLevel.WARN -> ideaLog.warn(line)
            else -> ideaLog.info(line)
        }
    }

    private val settingsListener: () -> Unit = {
        logs.setRetention(settings.snapshot().logRetention)
        engine.reloadCaches()
        uiState.refresh()
        val openProjects = ProjectManager.getInstance().openProjects
        openProjects.forEach { project ->
            if (!project.isDisposed) {
                ProjectSupport.refreshRecent(project)
                ApplicationManager.getApplication().invokeLater({
                    if (!project.isDisposed) {
                        project.getService(StatusBarWidgetsManager::class.java)
                            ?.updateWidget(AutoCompleteStatusBarFactory::class.java)
                    }
                }, ModalityState.any())
            }
        }
    }

    init {
        // Dual-write every accepted log line to idea.log (Help -> Show Log).
        logs.addListener(ideaLogListener)
        ideaLog.info("Auto Complete log bridge ready (buffer + idea.log)")
        settings.warmSecretsAsync()
        logs.setRetention(settings.snapshot().logRetention)
        engine =
            CompletionEngine(
                settings = ServiceSettingsSource(settings),
                logs = logs,
                projectContexts = projectContexts,
                httpClientProvider = { sharedHttpClient() },
                onFatal = { status, message ->
                    ApplicationManager.getApplication().invokeLater({
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
                    }, ModalityState.any())
                },
            )
        settings.addListener(settingsListener)
        engine.reloadCaches()
    }

    fun sharedHttpClient(): HttpClient {
        httpClientRef.get()?.let { return it }
        val created = IdeHttpSupport.createClient()
        return if (httpClientRef.compareAndSet(null, created)) {
            created
        } else {
            runCatching { created.close() }
            httpClientRef.get()!!
        }
    }

    override fun dispose() {
        settings.removeListener(settingsListener)
        logs.removeListener(ideaLogListener)
        engine.dispose()
        httpClientRef.getAndSet(null)?.let { client ->
            runCatching { client.close() }
        }
    }

    companion object {
        fun getInstance(): AutoCompleteAppService =
            ApplicationManager.getApplication().getService(AutoCompleteAppService::class.java)
    }
}

@Service(Service.Level.PROJECT)
class AutoCompleteProjectService(
    private val project: Project,
    private val cs: CoroutineScope,
) : Disposable {
    val app: AutoCompleteAppService = AutoCompleteAppService.getInstance()

    init {
        ProjectSupport.attach(project, this, cs)
    }

    fun reloadGitignore() {
        ProjectSupport.reloadGitignore(project, cs)
    }

    fun refreshRecent() {
        ProjectSupport.refreshRecent(project, cs)
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

    fun attach(
        project: Project,
        parentDisposable: Disposable,
        cs: CoroutineScope,
    ) {
        val key = project.locationHash
        if (!attached.attach(key, project)) return
        AutoCompleteAppService.getInstance().projectContexts.clear(key)
        log(project, LogLevel.DEBUG, "project_attach", "project attached")
        reloadGitignore(project, cs)
        refreshRecent(project, cs)

        // Connect to projectService (parentDisposable), NEVER to `project` (breaks dynamic plugin unload).
        project.messageBus.connect(parentDisposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    refreshRecent(project, cs)
                }

                override fun fileOpened(
                    source: FileEditorManager,
                    file: VirtualFile,
                ) {
                    refreshRecent(project, cs)
                }

                override fun fileClosed(
                    source: FileEditorManager,
                    file: VirtualFile,
                ) {
                    refreshRecent(project, cs)
                }
            },
        )

        // Reload .gitignore whenever a project .gitignore changes on disk/VFS.
        ApplicationManager.getApplication().messageBus.connect(parentDisposable).subscribe(
            VirtualFileManager.VFS_CHANGES,
            object : BulkFileListener {
                override fun after(events: List<VFileEvent>) {
                    if (project.isDisposed) return
                    val base = project.basePath?.replace('\\', '/')?.trimEnd('/') ?: return
                    val touched =
                        events.any { ev ->
                            val path = ev.path.replace('\\', '/')
                            path == "$base/.gitignore" ||
                                (path.startsWith("$base/") && path.endsWith("/.gitignore"))
                        }
                    if (touched) {
                        reloadGitignore(project, cs)
                    }
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
        !project.isDisposed && attached.isCurrent(project.locationHash, project)

    fun refreshRecent(project: Project) {
        if (project.isDisposed) return
        project.getServiceIfCreated(AutoCompleteProjectService::class.java)?.refreshRecent()
    }

    fun reloadGitignore(
        project: Project,
        cs: CoroutineScope,
    ) {
        if (project.isDisposed) return
        cs.launch(Dispatchers.IO) {
            if (project.isDisposed) return@launch
            val patterns = mutableListOf<String>()
            val basePath = project.basePath
            if (!basePath.isNullOrBlank()) {
                val text =
                    readAction {
                        if (project.isDisposed) return@readAction null
                        val giPath = "$basePath/.gitignore".replace('\\', '/')
                        val vf = LocalFileSystem.getInstance().findFileByPath(giPath)
                        if (vf != null && vf.isValid && !vf.isDirectory) {
                            FileDocumentManager.getInstance().getCachedDocument(vf)?.immutableCharSequence?.toString()
                                ?: runCatching { VfsUtil.loadText(vf) }.getOrNull()
                                ?: runCatching { String(vf.contentsToByteArray(), StandardCharsets.UTF_8) }.getOrNull()
                        } else {
                            null
                        }
                    } ?: runCatching {
                        val nio = Path.of(basePath, ".gitignore")
                        if (Files.isRegularFile(nio)) Files.readString(nio, StandardCharsets.UTF_8) else ""
                    }.getOrDefault("")
                if (text.isNotBlank()) {
                    patterns += IgnoreRules.parseGitignore(text)
                }
            }
            if (isCurrent(project)) {
                AutoCompleteAppService.getInstance().projectContexts.updateGitignorePatterns(
                    project.locationHash,
                    patterns,
                )
                log(project, LogLevel.DEBUG, "gitignore_reload", "patterns=${patterns.size}")
                refreshRecent(project, cs)
            }
        }
    }

    fun refreshRecent(
        project: Project,
        cs: CoroutineScope,
    ) {
        if (project.isDisposed) return
        val settingsService = AutoCompleteSettingsService.getInstance()
        val settings = settingsService.snapshot()
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
        cs.launch(Dispatchers.IO) {
            if (project.isDisposed) return@launch
            val app = AutoCompleteAppService.getInstance()
            val ignoreRules =
                IgnoreRules(
                    globs = settingsService.ignoreGlobList(),
                    respectGitignore = settings.respectGitignore,
                    gitignorePatterns = app.projectContexts.gitignorePatterns(project.locationHash),
                )
            val limit = settings.recentFileLimit.coerceAtLeast(0)
            val maxChars = settings.recentFileMaxChars.coerceAtLeast(0)
            val maxFileBytes = settings.maxFileSizeKb.toLong().coerceAtLeast(1L) * 1024L
            val basePath = project.basePath?.replace('\\', '/')?.trimEnd('/')

            val snippets =
                readAction {
                    if (project.isDisposed || limit == 0 || maxChars == 0) return@readAction emptyList()
                    val mgr = FileEditorManager.getInstance(project)
                    val currentFile = mgr.selectedFiles.firstOrNull()
                    val docMgr = FileDocumentManager.getInstance()
                    val collected = mutableListOf<String>()
                    for (file in mgr.openFiles) {
                        if (collected.size >= limit) break
                        if (!file.isValid || file.isDirectory) continue
                        if (currentFile != null && file == currentFile) continue
                        if (file.fileType.isBinary) continue
                        if (file.length > maxFileBytes) continue

                        val slashPath = file.path.replace('\\', '/')
                        val relPath =
                            if (!basePath.isNullOrEmpty() && slashPath.startsWith("$basePath/")) {
                                slashPath.removePrefix("$basePath/")
                            } else {
                                null
                            }
                        if (ignoreRules.isIgnored(slashPath, relPath)) continue

                        val text =
                            docMgr.getCachedDocument(file)?.immutableCharSequence?.toString()
                                ?: runCatching { VfsUtil.loadText(file) }.getOrNull()
                                ?: continue
                        val clipped = text.take(maxChars)
                        if (clipped.isNotBlank()) {
                            collected +=
                                if (settings.sendFilePath) {
                                    "File: ${relPath ?: file.name}\n$clipped"
                                } else {
                                    clipped
                                }
                        }
                    }
                    collected
                }
            if (isCurrent(project)) {
                app.projectContexts.updateRecentSnippets(project.locationHash, snippets)
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
