package io.autocomplete.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import io.autocomplete.i18n.message
import java.awt.BorderLayout
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants

/** Switch Settings | Logs inside the loaded Web UI (no separate Logs tool window). */
fun interface WebTabController {
    fun requestTab(tab: String)
}

/**
 * Shared settings-ui shell (**Web / JCEF only**).
 * Does not import JCEF types — host is loaded reflectively.
 */
class SettingsWebPanel(
    private val project: Project?,
    parentDisposable: Disposable,
) : JPanel(BorderLayout()),
    Disposable {
    private val log = Logger.getInstance(SettingsWebPanel::class.java)
    private var tabController: WebTabController? = null

    init {
        Disposer.register(parentDisposable, this)
        when (val result = SettingsJcefHost.tryMount(this, parentDisposable, AcUiEntry.preferredTab)) {
            is SettingsJcefHost.MountResult.Ok -> {
                tabController = result.controller
            }
            SettingsJcefHost.MountResult.Unavailable -> {
                val tip =
                    if (SettingsJcefHost.isJcefModulePluginPresent()) {
                        message("settings.web.jcefDisabled")
                    } else {
                        message("settings.web.jcefUnavailable")
                    }
                showError(tip)
            }
            is SettingsJcefHost.MountResult.Failed -> {
                log.error("JCEF settings failed", result.error)
                val detail =
                    (result.error.message ?: result.error.javaClass.simpleName).replace("<", "&lt;")
                val body =
                    when {
                        detail.contains("settings-ui", ignoreCase = true) ||
                            detail.contains("index.html", ignoreCase = true) ->
                            message("settings.web.bundleMissing") + "<br/><br/><code>$detail</code>"
                        else ->
                            message("settings.web.jcefFailed") + "<br/><br/><code>$detail</code>"
                    }
                showError(body)
            }
        }
    }

    fun requestTab(tab: String) {
        AcUiEntry.preferredTab = tab
        tabController?.requestTab(tab)
    }

    private fun showError(htmlBody: String) {
        removeAll()
        val html =
            "<html><body style='padding:16px;font-family:sans-serif'>" +
                "<h3>Auto Complete</h3>" +
                "<p>$htmlBody</p>" +
                "</body></html>"
        add(JLabel(html, SwingConstants.LEFT), BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    override fun dispose() {
        project?.let { SettingsWebToolWindowFactory.unregister(it) }
        tabController = null
    }
}
