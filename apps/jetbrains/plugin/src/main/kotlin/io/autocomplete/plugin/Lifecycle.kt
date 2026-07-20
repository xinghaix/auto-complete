package io.autocomplete.plugin

import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.diagnostic.Logger

class AutoCompleteLifecycleListener : AppLifecycleListener {
    private val log = Logger.getInstance(AutoCompleteLifecycleListener::class.java)

    override fun appStarted() {
        // Force service initialization so status/log are ready.
        runCatching { AutoCompleteAppService.getInstance() }
            .onFailure { log.warn("Auto Complete init failed", it) }
    }
}
