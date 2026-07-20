package io.autocomplete.log

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.content.ContentFactory
import io.autocomplete.i18n.message
import io.autocomplete.plugin.AutoCompleteAppService
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.SwingUtilities

class LogToolWindowFactory : ToolWindowFactory, DumbAware {
    private val log = Logger.getInstance(LogToolWindowFactory::class.java)

    override fun createToolWindowContent(
        project: Project,
        toolWindow: ToolWindow,
    ) {
        toolWindow.setStripeTitle(message("toolwindow.logs"))
        toolWindow.title = message("toolwindow.logs")
        // plugin.xml also sets icon; re-apply so dark variant resolves via IconLoader.
        toolWindow.setIcon(io.autocomplete.ui.AutoCompleteIcons.ToolWindow)
        val panel =
            runCatching { LogPanel() }
                .getOrElse { error ->
                    log.warn("Failed to create Auto Complete log panel", error)
                    JPanel(BorderLayout()).apply {
                        add(
                            JTextArea().apply {
                                isEditable = false
                                text = "Log panel failed to start: ${error.message}\nSee idea.log for details."
                            },
                            BorderLayout.CENTER,
                        )
                    }
                }
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

class LogPanel : JPanel(BorderLayout()) {
    private val area =
        JTextArea().apply {
            isEditable = false
            lineWrap = true
            wrapStyleWord = true
            font = font.deriveFont(12f)
        }
    private val app: AutoCompleteAppService =
        checkNotNull(AutoCompleteAppService.getInstance()) {
            "AutoCompleteAppService is not available"
        }
    private val listener: (LogEntry) -> Unit = { entry ->
        SwingUtilities.invokeLater {
            area.append(entry.summary())
            area.append("\n")
            area.caretPosition = area.document.length
        }
    }

    init {
        val buttons =
            JPanel(FlowLayout(FlowLayout.LEFT)).apply {
                add(
                    JButton(message("logs.refresh")).also { b ->
                        b.addActionListener { reload() }
                    },
                )
                add(
                    JButton(message("logs.clear")).also { b ->
                        b.addActionListener {
                            app.logs.clear()
                            area.text = message("logs.ready") + "\n"
                        }
                    },
                )
                add(
                    JButton(message("logs.copy")).also { b ->
                        b.addActionListener {
                            area.selectAll()
                            area.copy()
                        }
                    },
                )
            }
        add(buttons, BorderLayout.NORTH)
        add(JBScrollPane(area), BorderLayout.CENTER)
        app.logs.addListener(listener)
        reload()
    }

    private fun reload() {
        val snap = app.logs.snapshot()
        area.text =
            if (snap.isEmpty()) {
                message("logs.ready") + "\n"
            } else {
                snap.joinToString("\n") { it.summary() } + "\n"
            }
        area.caretPosition = area.document.length
    }
}
