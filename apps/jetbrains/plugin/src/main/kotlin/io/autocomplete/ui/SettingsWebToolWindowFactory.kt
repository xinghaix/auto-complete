package io.autocomplete.ui

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.ContentFactory
import io.autocomplete.i18n.message
import java.util.concurrent.ConcurrentHashMap

/**
 * Single tool window hosting settings-ui (Settings | Logs tabs).
 * No separate Logs tool window / no IDE Settings Configurable.
 */
class SettingsWebToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(
        project: Project,
        toolWindow: ToolWindow,
    ) {
        toolWindow.setStripeTitle(message("name"))
        toolWindow.title = message("name")
        toolWindow.setIcon(AutoCompleteIcons.ToolWindow)
        val panel = SettingsWebPanel(project)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        // Single disposer owner: content disposes panel cleanly when content/toolWindow closes.
        content.setDisposer(panel)
        toolWindow.contentManager.addContent(content)
        activePanels[project] = panel
    }

    companion object {
        private val activePanels = ConcurrentHashMap<Project, SettingsWebPanel>()

        fun show(
            project: Project,
            tab: String,
        ) {
            AcUiEntry.setPreferredTab(project, tab)
            val tw =
                ToolWindowManager.getInstance(project).getToolWindow("Auto Complete")
                    ?: return
            tw.show {
                activePanels[project]?.requestTab(tab)
            }
        }

        fun unregister(project: Project) {
            activePanels.remove(project)
        }
    }
}
