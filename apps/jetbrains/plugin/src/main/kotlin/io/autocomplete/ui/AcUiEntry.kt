package io.autocomplete.ui

/**
 * Coordinates the single Web tool window (Settings | Logs) shared with VS Code settings-ui.
 * Hosts set [preferredTab] before showing the tool window; JCEF injects it into the page.
 */
object AcUiEntry {
    /** Web UI tabs: config | behavior | logs (legacy "settings" → config). */
    const val TAB_CONFIG = "config"
    const val TAB_BEHAVIOR = "behavior"
    const val TAB_LOGS = "logs"
    const val TAB_SETTINGS = TAB_CONFIG // legacy alias

    @Volatile
    var preferredTab: String = TAB_CONFIG

    fun openSettings() {
        preferredTab = TAB_CONFIG
    }

    fun openLogs() {
        preferredTab = TAB_LOGS
    }
}
