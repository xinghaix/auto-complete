package io.autocomplete.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListSeparator
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.util.BaseListPopupStep
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.ui.awt.RelativePoint
import com.intellij.util.Consumer
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.i18n.message
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.util.LanguageMap
import io.autocomplete.util.SecretRedactor
import java.awt.Component
import java.awt.event.MouseEvent
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.CopyOnWriteArraySet
import kotlin.math.ceil

class AutoCompleteStatusBarFactory : StatusBarWidgetFactory {
    override fun getId(): String = ID

    override fun getDisplayName(): String = message("name")

    override fun isAvailable(project: Project): Boolean =
        AutoCompleteSettingsService.getInstance().snapshot().showStatusBar

    override fun createWidget(project: Project): StatusBarWidget = AutoCompleteStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true

    companion object {
        const val ID = "AutoCompleteStatusBar"
    }
}

internal object StatusBarFormatting {
    private val TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun formatSnoozeUntil(
        snoozeUntilMs: Long,
        nowMs: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String {
        val localTime = Instant.ofEpochMilli(snoozeUntilMs).atZone(zoneId).toLocalTime()
        val timeText = TIME_FMT.format(localTime)
        val remainingMs = (snoozeUntilMs - nowMs).coerceAtLeast(0L)
        val minutes = ceil(remainingMs / 60_000.0).toLong()
        return if (minutes <= 0L) {
            "$timeText (<1m)"
        } else {
            "$timeText (${minutes}m)"
        }
    }
}

class AutoCompleteStatusBarWidget(
    private val project: Project,
) : StatusBarWidget,
    StatusBarWidget.TextPresentation {
    private var statusBar: StatusBar? = null
    @Volatile private var disposed = false

    private val uiListener: () -> Unit = { refresh() }
    private val settingsListener: () -> Unit = { refresh() }

    init {
        AutoCompleteAppService.getInstance().uiState.addListener(uiListener)
        AutoCompleteSettingsService.getInstance().addListener(settingsListener)
    }

    override fun ID(): String = AutoCompleteStatusBarFactory.ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        refresh()
    }

    override fun dispose() {
        disposed = true
        AutoCompleteAppService.getInstance().uiState.removeListener(uiListener)
        AutoCompleteSettingsService.getInstance().removeListener(settingsListener)
        statusBar = null
    }

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getText(): String {
        val settings = AutoCompleteSettingsService.getInstance()
        val s = settings.snapshot()
        val ui = AutoCompleteAppService.getInstance().uiState
        if (!s.enabled) return message("status.off")
        if (settings.isSnoozed()) return message("status.snoozed")
        if (ui.loading) return message("status.loading")
        val err = ui.lastError
        if (!err.isNullOrBlank()) return message("status.error")
        val model = s.model.substringAfterLast('/').take(18)
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
        val activeName = settings.activeProfile()?.name.orEmpty()
        return buildString {
            append(message("name")).append('\n')
            if (activeName.isNotBlank()) {
                append(message("status.tooltip.profile", activeName)).append('\n')
            }
            append(message("status.tooltip.model", s.model.ifBlank { "-" })).append('\n')
            append(message("status.tooltip.baseUrl", SecretRedactor.redactUrl(s.baseUrl).ifBlank { "-" })).append('\n')
            if (ui.loading) {
                append(message("status.tooltip.loading")).append('\n')
            }
            if (settings.isSnoozed()) {
                val formatted = StatusBarFormatting.formatSnoozeUntil(s.snoozeUntil)
                append(message("status.tooltip.snoozedUntil", formatted)).append('\n')
            }
            ui.lastError?.takeIf { it.isNotBlank() }?.let {
                append(message("status.tooltip.error", SecretRedactor.redactText(it))).append('\n')
            }
            ui.lastLatencyMs?.let {
                append(message("status.tooltip.latency", it)).append('\n')
            }
            append(message("status.tooltip.actions"))
        }
    }

    override fun getClickConsumer(): Consumer<MouseEvent> =
        Consumer { event ->
            showQuickMenu(event)
        }

    private sealed class MenuItem(
        val label: String,
        val separatorBefore: String? = null,
    ) {
        class SwitchProfile(
            val profileId: String,
            label: String,
            separatorBefore: String? = null,
        ) : MenuItem(label, separatorBefore)

        class ToggleEnabled(
            label: String,
            separatorBefore: String? = null,
        ) : MenuItem(label, separatorBefore)

        class SnoozeSubmenu(
            label: String,
        ) : MenuItem(label)

        class SnoozeDuration(
            val minutes: Int,
            label: String,
        ) : MenuItem(label)

        class ResumeSnooze(
            label: String,
        ) : MenuItem(label)

        class ToggleLanguage(
            val languageId: String,
            label: String,
        ) : MenuItem(label)

        class OpenSettings(
            label: String,
            separatorBefore: String? = null,
        ) : MenuItem(label, separatorBefore)

        class OpenLogs(
            label: String,
        ) : MenuItem(label)

        class ClearCaches(
            label: String,
        ) : MenuItem(label)
    }

    private fun showQuickMenu(event: MouseEvent) {
        if (disposed || project.isDisposed) return
        val settings = AutoCompleteSettingsService.getInstance()
        val s = settings.snapshot()
        val profiles = settings.profiles()
        val activeId = settings.activeProfileId()
        val items = mutableListOf<MenuItem>()

        if (profiles.isNotEmpty()) {
            profiles.forEachIndexed { idx, p ->
                val mark = if (p.id == activeId) "✓ " else "   "
                val suffix = p.model.substringAfterLast('/').takeIf { it.isNotBlank() }?.let { " ($it)" }.orEmpty()
                items +=
                    MenuItem.SwitchProfile(
                        profileId = p.id,
                        label = "$mark${p.name}$suffix",
                        separatorBefore = if (idx == 0) message("status.menu.profiles") else null,
                    )
            }
        }

        val toggleLabel =
            if (s.enabled) {
                message("status.menu.disable")
            } else {
                message("status.menu.enable")
            }
        items +=
            MenuItem.ToggleEnabled(
                label = toggleLabel,
                separatorBefore = if (items.isNotEmpty()) "" else null,
            )

        if (settings.isSnoozed()) {
            items += MenuItem.ResumeSnooze(message("status.menu.resume"))
        } else {
            items += MenuItem.SnoozeSubmenu(message("status.menu.snooze"))
        }

        val currentLang = currentEditorLanguage()
        if (!currentLang.isNullOrBlank()) {
            val isDisabled = currentLang in settings.disabledLanguageSet()
            val langLabel =
                if (isDisabled) {
                    message("status.menu.enableLanguage", currentLang)
                } else {
                    message("status.menu.disableLanguage", currentLang)
                }
            items += MenuItem.ToggleLanguage(currentLang, langLabel)
        }

        items += MenuItem.OpenSettings(message("status.menu.openSettings"), separatorBefore = "")
        items += MenuItem.OpenLogs(message("status.menu.openLogs"))
        items += MenuItem.ClearCaches(message("status.menu.clearCaches"))

        val step =
            object : BaseListPopupStep<MenuItem>(message("name"), items) {
                override fun getTextFor(value: MenuItem): String = value.label

                override fun getSeparatorAbove(value: MenuItem): ListSeparator? =
                    value.separatorBefore?.let { ListSeparator(it) }

                override fun hasSubstep(selectedValue: MenuItem?): Boolean =
                    selectedValue is MenuItem.SnoozeSubmenu

                override fun onChosen(
                    selectedValue: MenuItem,
                    finalChoice: Boolean,
                ): PopupStep<*>? {
                    if (selectedValue is MenuItem.SnoozeSubmenu) {
                        val snoozeItems =
                            listOf(
                                MenuItem.SnoozeDuration(15, message("status.menu.snooze15m")),
                                MenuItem.SnoozeDuration(30, message("status.menu.snooze30m")),
                                MenuItem.SnoozeDuration(60, message("status.menu.snooze1h")),
                            )
                        return object : BaseListPopupStep<MenuItem.SnoozeDuration>(message("status.menu.snooze"), snoozeItems) {
                            override fun getTextFor(value: MenuItem.SnoozeDuration): String = value.label

                            override fun onChosen(
                                selected: MenuItem.SnoozeDuration,
                                finalChoice: Boolean,
                            ): PopupStep<*>? =
                                doFinalStep {
                                    settings.snooze(selected.minutes)
                                    refresh()
                                }
                        }
                    }
                    return doFinalStep {
                        when (selectedValue) {
                            is MenuItem.SwitchProfile -> {
                                settings.selectProfile(selectedValue.profileId)
                                refresh()
                            }
                            is MenuItem.ToggleEnabled -> {
                                settings.update { enabled = !enabled }
                                refresh()
                            }
                            is MenuItem.ResumeSnooze -> {
                                settings.unsnooze()
                                refresh()
                            }
                            is MenuItem.ToggleLanguage -> {
                                settings.toggleLanguageDisabled(selectedValue.languageId)
                                refresh()
                            }
                            is MenuItem.OpenSettings -> {
                                AcUiEntry.openSettings(project)
                                SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_CONFIG)
                            }
                            is MenuItem.OpenLogs -> {
                                AcUiEntry.openLogs(project)
                                SettingsWebToolWindowFactory.show(project, AcUiEntry.TAB_LOGS)
                            }
                            is MenuItem.ClearCaches -> {
                                val app = AutoCompleteAppService.getInstance()
                                app.engine.clearCaches()
                                app.uiState.onAccepted()
                            }
                            is MenuItem.SnoozeSubmenu,
                            is MenuItem.SnoozeDuration,
                            -> Unit
                        }
                    }
                }
            }

        val popup = JBPopupFactory.getInstance().createListPopup(step)
        popup.show(RelativePoint(event))
    }

    private fun currentEditorLanguage(): String? {
        if (project.isDisposed) return null
        val vf = FileEditorManager.getInstance(project).selectedFiles.firstOrNull() ?: return null
        return LanguageMap.normalize(vf.fileType.name, vf.path).takeIf { it.isNotBlank() }
    }

    private fun refresh() {
        if (disposed || project.isDisposed) return
        ApplicationManager.getApplication().invokeLater({
            if (!disposed && !project.isDisposed) {
                statusBar?.updateWidget(ID())
            }
        }, ModalityState.any())
    }
}

/**
 * Thread-safe shared UI state for status bar / notifications.
 */
class UiState {
    @Volatile var lastLatencyMs: Long? = null
    @Volatile var lastModel: String? = null
    @Volatile var lastError: String? = null
    @Volatile var lastCached: Boolean = false
    @Volatile var loading: Boolean = false
    private val listeners = CopyOnWriteArraySet<() -> Unit>()

    fun addListener(listener: () -> Unit) {
        listeners += listener
    }

    fun removeListener(listener: () -> Unit) {
        listeners -= listener
    }

    fun refresh() = listeners.forEach { runCatching { it.invoke() } }

    fun onLoading(isLoading: Boolean) {
        loading = isLoading
        refresh()
    }

    fun onSuccess(
        latency: Long,
        model: String,
        cached: Boolean,
    ) {
        loading = false
        lastLatencyMs = latency
        lastModel = model
        lastCached = cached
        lastError = null
        refresh()
    }

    fun onError(message: String) {
        loading = false
        lastError = message
        refresh()
    }

    fun onAccepted() {
        loading = false
        lastError = null
        refresh()
    }
}
