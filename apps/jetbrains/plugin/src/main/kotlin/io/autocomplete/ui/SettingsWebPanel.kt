package io.autocomplete.ui

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import io.autocomplete.i18n.message
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants

/** Switch Settings | Logs inside the loaded Web UI (no separate Logs tool window). */
fun interface WebTabController {
    fun requestTab(tab: String)
}

/**
 * Shared settings-ui shell (**Web / JCEF when available**).
 * Does not import JCEF types — host is loaded reflectively.
 * When JCEF cannot mount, shows a pure Swing recovery panel with steps (no Web/JCEF).
 */
class SettingsWebPanel(
    private val project: Project?,
    parentDisposable: Disposable,
) : JPanel(BorderLayout()),
    Disposable {
    private val log = Logger.getInstance(SettingsWebPanel::class.java)
    private var tabController: WebTabController? = null
    private var mountSession: Disposable? = null

    init {
        Disposer.register(parentDisposable, this)
        mountOrRecover(AcUiEntry.preferredTab)
    }

    fun requestTab(tab: String) {
        AcUiEntry.preferredTab = tab
        tabController?.requestTab(tab)
    }

    private fun mountOrRecover(initialTab: String) {
        disposeMountSession()
        when (val result = SettingsJcefHost.tryMount(this, this, initialTab)) {
            is SettingsJcefHost.MountResult.Ok -> {
                tabController = result.controller
                mountSession = result.session
                revalidate()
                repaint()
            }
            SettingsJcefHost.MountResult.Unavailable -> {
                showRecovery(JcefEnvironment.diagnoseUnavailable())
            }
            is SettingsJcefHost.MountResult.Failed -> {
                log.error("JCEF settings failed", result.error)
                showRecovery(JcefEnvironment.diagnoseMountFailure(result.error))
            }
        }
    }

    private fun showRecovery(diagnosis: JcefEnvironment.Diagnosis) {
        tabController = null
        removeAll()
        layout = BorderLayout()

        val html =
            "<html><body style='width:420px;padding:4px 8px;font-family:sans-serif;font-size:12px'>" +
                JcefEnvironment.buildGuidanceHtml(diagnosis) +
                "</body></html>"
        val label = JLabel(html, SwingConstants.LEFT)
        label.border = JBUI.Borders.empty(12, 16, 8, 16)

        val actions = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))
        actions.border = JBUI.Borders.empty(0, 12, 12, 12)
        actions.add(
            JButton(message("settings.web.jcef.action.plugins")).apply {
                toolTipText = message("settings.web.jcef.action.plugins.tooltip")
                addActionListener { openPluginsSettings() }
            },
        )
        actions.add(
            JButton(message("settings.web.jcef.action.guide")).apply {
                toolTipText = message("settings.web.jcef.action.guide.tooltip")
                addActionListener { BrowserUtil.browse(JcefEnvironment.GUIDE_URL) }
            },
        )
        actions.add(
            JButton(message("settings.web.jcef.action.retry")).apply {
                toolTipText = message("settings.web.jcef.action.retry.tooltip")
                addActionListener { mountOrRecover(AcUiEntry.preferredTab) }
            },
        )

        val column = JPanel()
        column.layout = BoxLayout(column, BoxLayout.Y_AXIS)
        column.add(label)
        column.add(Box.createVerticalStrut(4))
        column.add(actions)

        add(JBScrollPane(column), BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    private fun openPluginsSettings() {
        val util = ShowSettingsUtil.getInstance()
        // showSettingsDialog requires a non-null Project on this platform API.
        val p = project
        if (p == null) {
            BrowserUtil.browse(JcefEnvironment.GUIDE_URL)
            return
        }
        runCatching {
            util.showSettingsDialog(p, message("settings.web.jcef.pluginsSearch"))
        }.recoverCatching {
            util.showSettingsDialog(p)
        }
    }

    private fun disposeMountSession() {
        tabController = null
        val session = mountSession
        mountSession = null
        if (session != null) {
            runCatching { Disposer.dispose(session) }
        }
    }

    override fun dispose() {
        disposeMountSession()
        project?.let { SettingsWebToolWindowFactory.unregister(it) }
    }
}
