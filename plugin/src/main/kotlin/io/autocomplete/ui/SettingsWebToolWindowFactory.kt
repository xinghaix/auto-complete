package io.autocomplete.ui

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.ContentFactory
import io.autocomplete.i18n.message

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
        val panel = SettingsWebPanel(project, toolWindow.disposable)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        content.setDisposer(panel)
        toolWindow.contentManager.addContent(content)
        activePanels[project] = panel
    }

    companion object {
        private val activePanels = java.util.concurrent.ConcurrentHashMap<Project, SettingsWebPanel>()

        fun show(
            project: Project,
            tab: String,
        ) {
            AcUiEntry.preferredTab = tab
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
