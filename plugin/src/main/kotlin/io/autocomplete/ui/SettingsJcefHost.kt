package io.autocomplete.ui

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.util.Disposer
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Reflective JCEF loader — keeps [SettingsWebPanel] free of jcef types.
 */
internal object SettingsJcefHost {
    private val log = Logger.getInstance(SettingsJcefHost::class.java)

    private const val JCEF_PLUGIN_ID = "com.intellij.modules.jcef"
    private const val JBCEF_BROWSER = "com.intellij.ui.jcef.JBCefBrowser"
    private const val IMPL = "io.autocomplete.ui.SettingsJcefHostImpl"

    fun isJcefClassReachable(): Boolean = canLoad(JBCEF_BROWSER)

    fun isJcefModulePluginPresent(): Boolean =
        runCatching {
            PluginManagerCore.getPlugin(PluginId.getId(JCEF_PLUGIN_ID)) != null
        }.getOrDefault(false)

    fun tryMount(
        panel: JPanel,
        parentDisposable: Disposable,
        initialTab: String,
    ): MountResult {
        if (!isJcefClassReachable()) {
            log.info("JBCefBrowser not reachable; jcef module present=${isJcefModulePluginPresent()}")
            return MountResult.Unavailable
        }
        return try {
            val impl = Class.forName(IMPL, true, SettingsJcefHost::class.java.classLoader)
            val method =
                impl.getMethod(
                    "mount",
                    JPanel::class.java,
                    Disposable::class.java,
                    String::class.java,
                )
            val session = method.invoke(null, panel, parentDisposable, initialTab)
            if (session is Disposable) {
                Disposer.register(parentDisposable, session)
            }
            val controller =
                if (session is WebTabController) {
                    session
                } else {
                    WebTabController { /* no-op */ }
                }
            MountResult.Ok(controller)
        } catch (t: Throwable) {
            log.warn("JCEF host mount failed", t)
            MountResult.Failed(t)
        }
    }

    private fun canLoad(fqcn: String): Boolean =
        try {
            Class.forName(fqcn, false, SettingsJcefHost::class.java.classLoader)
            true
        } catch (_: Throwable) {
            false
        }

    sealed class MountResult {
        data class Ok(
            val controller: WebTabController,
        ) : MountResult()

        data object Unavailable : MountResult()

        data class Failed(
            val error: Throwable,
        ) : MountResult()
    }
}

internal fun JPanel.replaceWithBrowser(component: JComponent) {
    removeAll()
    layout = BorderLayout()
    add(component, BorderLayout.CENTER)
    revalidate()
    repaint()
}
