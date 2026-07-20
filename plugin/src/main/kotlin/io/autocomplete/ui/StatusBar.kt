package io.autocomplete.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.i18n.message
import io.autocomplete.plugin.AutoCompleteAppService
import java.awt.Component
import java.awt.event.MouseEvent

class AutoCompleteStatusBarFactory : StatusBarWidgetFactory {
    override fun getId(): String = ID

    override fun getDisplayName(): String = message("name")

    override fun isAvailable(project: Project): Boolean =
        AutoCompleteSettingsService.getInstance().snapshot().showStatusBar

    override fun createWidget(project: Project): StatusBarWidget = AutoCompleteStatusBarWidget()

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true

    companion object {
        const val ID = "AutoCompleteStatusBar"
    }
}

class AutoCompleteStatusBarWidget : StatusBarWidget, StatusBarWidget.TextPresentation {
    private var statusBar: StatusBar? = null

    init {
        AutoCompleteAppService.getInstance().uiState.addListener { refresh() }
        AutoCompleteSettingsService.getInstance().addListener { refresh() }
    }

    override fun ID(): String = AutoCompleteStatusBarFactory.ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        refresh()
    }

    override fun dispose() {
        statusBar = null
    }

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getText(): String {
        val settings = AutoCompleteSettingsService.getInstance()
        val ui = AutoCompleteAppService.getInstance().uiState
        if (!settings.snapshot().enabled) return message("status.off")
        if (settings.isSnoozed()) return message("status.snoozed")
        val err = ui.lastError
        if (!err.isNullOrBlank()) return message("status.error")
        val model = settings.snapshot().model.substringAfterLast('/').take(18)
        val latency = ui.lastLatencyMs
        return buildString {
            append(message("status.on"))
            if (model.isNotBlank()) append(' ').append(model)
            if (latency != null) append(' ').append(latency).append("ms")
        }
    }

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT

    override fun getTooltipText(): String {
        val settings = AutoCompleteSettingsService.getInstance()
        val s = settings.snapshot()
        val ui = AutoCompleteAppService.getInstance().uiState
        return buildString {
            append(message("name")).append('\n')
            append(message("status.tooltip.model", s.model)).append('\n')
            append(message("status.tooltip.baseUrl", s.baseUrl)).append('\n')
            if (settings.isSnoozed()) append(message("status.tooltip.snoozedUntil", s.snoozeUntil)).append('\n')
            ui.lastError?.let { append(message("status.tooltip.error", it)).append('\n') }
            ui.lastLatencyMs?.let { append(message("status.tooltip.latency", it)).append('\n') }
            append(message("status.tooltip.actions"))
        }
    }

    override fun getClickConsumer(): Consumer<MouseEvent> =
        Consumer { event ->
            val settings = AutoCompleteSettingsService.getInstance()
            if (event.isShiftDown) {
                if (settings.isSnoozed()) settings.unsnooze() else settings.snooze(30)
            } else {
                settings.update { enabled = !enabled }
            }
            refresh()
        }

    private fun refresh() {
        ApplicationManager.getApplication().invokeLater {
            statusBar?.updateWidget(ID())
        }
    }
}

/**
 * Tiny shared UI state for status bar / notifications.
 */
class UiState {
    @Volatile var lastLatencyMs: Long? = null
    @Volatile var lastModel: String? = null
    @Volatile var lastError: String? = null
    @Volatile var lastCached: Boolean = false
    private val listeners = LinkedHashSet<() -> Unit>()

    fun addListener(listener: () -> Unit) {
        listeners += listener
    }

    fun refresh() = listeners.toList().forEach { runCatching { it.invoke() } }

    fun onSuccess(
        latency: Long,
        model: String,
        cached: Boolean,
    ) {
        lastLatencyMs = latency
        lastModel = model
        lastCached = cached
        lastError = null
        refresh()
    }

    fun onError(message: String) {
        lastError = message
        refresh()
    }

    fun onAccepted() {
        lastError = null
        refresh()
    }
}
