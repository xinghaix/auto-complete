package io.autocomplete.ui

import com.intellij.openapi.project.Project
import java.util.Collections
import java.util.WeakHashMap

/**
 * Coordinates the single Web tool window (Settings | Logs) shared with VS Code settings-ui.
 * Tracks preferred tab per [Project] so multiple open IDE windows never interfere.
 */
object AcUiEntry {
    /** Web UI tabs (aligned with packages/settings/ui). */
    const val TAB_PROFILE = "profile"
    const val TAB_CONFIG = "config"
    const val TAB_BEHAVIOR = "behavior"
    const val TAB_PERFORMANCE = "performance"
    const val TAB_GENERAL = "general"
    const val TAB_LOGS = "logs"
    const val TAB_ABOUT = "about"
    const val TAB_SETTINGS = TAB_CONFIG // legacy alias

    val ALL_TABS: Set<String> =
        setOf(
            TAB_PROFILE,
            TAB_CONFIG,
            TAB_BEHAVIOR,
            TAB_PERFORMANCE,
            TAB_GENERAL,
            TAB_LOGS,
            TAB_ABOUT,
        )

    private val preferredTabs = Collections.synchronizedMap(WeakHashMap<Project, String>())

    @Volatile
    private var fallbackTab: String = TAB_CONFIG

    fun preferredTab(project: Project?): String {
        if (project == null) return fallbackTab
        return synchronized(preferredTabs) {
            preferredTabs[project] ?: TAB_CONFIG
        }
    }

    fun setPreferredTab(
        project: Project?,
        tab: String,
    ) {
        val normalized = normalizeTab(tab)
        if (project == null) {
            fallbackTab = normalized
        } else {
            synchronized(preferredTabs) {
                preferredTabs[project] = normalized
            }
        }
    }

    fun openSettings(project: Project? = null) {
        setPreferredTab(project, TAB_CONFIG)
    }

    fun openLogs(project: Project? = null) {
        setPreferredTab(project, TAB_LOGS)
    }

    fun clear(project: Project) {
        synchronized(preferredTabs) {
            preferredTabs.remove(project)
        }
    }

    fun normalizeTab(raw: String?): String =
        when (raw?.trim()?.lowercase()) {
            "logs", "log" -> TAB_LOGS
            "behavior", "behaviour" -> TAB_BEHAVIOR
            "performance", "perf" -> TAB_PERFORMANCE
            "general" -> TAB_GENERAL
            "about" -> TAB_ABOUT
            "profile" -> TAB_PROFILE
            else -> TAB_CONFIG
        }
}
