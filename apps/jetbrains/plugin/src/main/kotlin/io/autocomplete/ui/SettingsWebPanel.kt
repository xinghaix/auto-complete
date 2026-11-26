package io.autocomplete.ui

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ColorUtil
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import io.autocomplete.i18n.message
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JEditorPane
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

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
) : JPanel(BorderLayout()),
    Disposable {
    private val log = Logger.getInstance(SettingsWebPanel::class.java)
    private var tabController: WebTabController? = null
    private var mountSession: Disposable? = null

    init {
        mountOrRecover(AcUiEntry.preferredTab(project))
    }

    fun requestTab(tab: String) {
        AcUiEntry.setPreferredTab(project, tab)
        tabController?.requestTab(tab)
    }

    private fun mountOrRecover(initialTab: String) {
        disposeMountSession()
        when (val result = SettingsJcefHost.tryMount(this, this, project, initialTab)) {
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

        val fgHex = ColorUtil.toHex(UIUtil.getLabelForeground())
        val mutedHex = ColorUtil.toHex(UIUtil.getContextHelpForeground())
        val html =
            "<html><body style='margin:0;padding:4px 8px;color:#$fgHex'>" +
                JcefEnvironment.buildGuidanceHtml(diagnosis, mutedColorHex = mutedHex) +
                "</body></html>"

        val pane =
            object : JEditorPane("text/html", html) {
                override fun getScrollableTracksViewportWidth(): Boolean = true
            }.apply {
                isEditable = false
                isOpaque = false
                putClientProperty(JEditorPane.HONOR_DISPLAY_PROPERTIES, true)
                font = UIUtil.getLabelFont()
                border = JBUI.Borders.empty(12, 16, 8, 16)
            }

        val actions =
            JPanel(FlowLayout(FlowLayout.LEFT, 8, 4)).apply {
                isOpaque = false
                alignmentX = LEFT_ALIGNMENT
                border = JBUI.Borders.empty(0, 12, 12, 12)
                maximumSize = Dimension(Int.MAX_VALUE, preferredSize.height.coerceAtLeast(48))
                add(
                    JButton(message("settings.web.jcef.action.plugins")).apply {
                        toolTipText = message("settings.web.jcef.action.plugins.tooltip")
                        addActionListener { openPluginsSettings() }
                    },
                )
                add(
                    JButton(message("settings.web.jcef.action.guide")).apply {
                        toolTipText = message("settings.web.jcef.action.guide.tooltip")
                        addActionListener { BrowserUtil.browse(JcefEnvironment.GUIDE_URL) }
                    },
                )
                add(
                    JButton(message("settings.web.jcef.action.retry")).apply {
                        toolTipText = message("settings.web.jcef.action.retry.tooltip")
                        addActionListener { mountOrRecover(AcUiEntry.preferredTab(project)) }
                    },
                )
            }

        val column =
            JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                isOpaque = false
                pane.alignmentX = LEFT_ALIGNMENT
                add(pane)
                add(Box.createVerticalStrut(4))
                add(actions)
            }

        val scroll =
            JBScrollPane(
                column,
                ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
                ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
            ).apply {
                border = JBUI.Borders.empty()
            }
        add(scroll, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    private fun openPluginsSettings() {
        val util = ShowSettingsUtil.getInstance()
        val p = project
        if (p == null) {
            BrowserUtil.browse(JcefEnvironment.GUIDE_URL)
            return
        }
        runCatching {
            util.showSettingsDialog(
                p,
                { configurable -> (configurable as? SearchableConfigurable)?.id == "preferences.pluginManager" },
                null,
            )
        }.onFailure {
            BrowserUtil.browse(JcefEnvironment.GUIDE_URL)
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
        project?.let {
            AcUiEntry.clear(it)
            SettingsWebToolWindowFactory.unregister(it)
        }
    }
}
