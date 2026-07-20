package io.autocomplete.ui

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Brand icons shipped under `resources/icons` and `META-INF/pluginIcon*.svg`.
 * IntelliJ auto-picks `*_dark.svg` variants on dark themes when using [IconLoader].
 */
object AutoCompleteIcons {
    /** 16px — menus, actions, settings. */
    @JvmField
    val Action: Icon = IconLoader.getIcon("/icons/acAction.svg", AutoCompleteIcons::class.java)

    /** 16px — tool window strip. */
    @JvmField
    val ToolWindow: Icon = IconLoader.getIcon("/icons/acToolWindow.svg", AutoCompleteIcons::class.java)

    /** 40px plugin list / Marketplace-style mark (same asset as META-INF/pluginIcon.svg). */
    @JvmField
    val Plugin: Icon = IconLoader.getIcon("/META-INF/pluginIcon.svg", AutoCompleteIcons::class.java)
}
