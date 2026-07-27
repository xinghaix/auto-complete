package io.autocomplete.ui

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.registry.Registry
import io.autocomplete.i18n.message

/**
 * Runtime JCEF availability without importing jcef types.
 * Used by the Swing recovery panel when the Web settings UI cannot mount.
 */
internal object JcefEnvironment {
    const val JCEF_PLUGIN_ID = "com.intellij.modules.jcef"
    const val GUIDE_URL = "https://github.com/xinghaix/auto-complete/blob/main/docs/GUIDE.md"
    private const val JBCEF_BROWSER = "com.intellij.ui.jcef.JBCefBrowser"
    private const val REGISTRY_JCEF_ENABLED = "ide.browser.jcef.enabled"

    enum class Kind {
        /** Classes missing; on modern IDEs often means Web Browser (JCEF) not installed/enabled. */
        CLASSES_MISSING,

        /** Classes load but mount failed (disabled, headless, native init, etc.). */
        MOUNT_FAILED,

        /** settings-ui assets missing from the package (dev rebuild). */
        BUNDLE_MISSING,
    }

    data class Diagnosis(
        val kind: Kind,
        val jcefClassesReachable: Boolean,
        val jcefModulePresent: Boolean,
        val registryJcefEnabled: Boolean?,
        val ideSummary: String,
        val detail: String? = null,
    )

    fun isJcefClassReachable(): Boolean = canLoad(JBCEF_BROWSER)

    fun isJcefModulePluginPresent(): Boolean =
        runCatching {
            PluginManagerCore.getPlugin(PluginId.getId(JCEF_PLUGIN_ID)) != null
        }.getOrDefault(false)

    /**
     * Best-effort Registry read. Returns null if the key is absent on this platform.
     */
    fun isRegistryJcefEnabled(): Boolean? =
        runCatching { Registry.`is`(REGISTRY_JCEF_ENABLED) }.getOrNull()

    fun ideSummary(): String {
        val os = "${SystemInfo.OS_NAME} ${SystemInfo.OS_VERSION}"
        val ide =
            runCatching {
                val info = ApplicationInfo.getInstance()
                val name = info.fullApplicationName ?: info.versionName ?: "IDE"
                val build = info.build?.asString() ?: "?"
                "$name · build $build"
            }.getOrDefault("IDE")
        return "$ide · $os"
    }

    fun diagnoseUnavailable(): Diagnosis =
        Diagnosis(
            kind = Kind.CLASSES_MISSING,
            jcefClassesReachable = false,
            jcefModulePresent = isJcefModulePluginPresent(),
            registryJcefEnabled = isRegistryJcefEnabled(),
            ideSummary = ideSummary(),
        )

    fun diagnoseMountFailure(error: Throwable): Diagnosis {
        val msg = error.message.orEmpty()
        val kind =
            if (
                msg.contains("settings-ui", ignoreCase = true) ||
                msg.contains("index.html", ignoreCase = true) ||
                msg.contains("bundle", ignoreCase = true)
            ) {
                Kind.BUNDLE_MISSING
            } else {
                Kind.MOUNT_FAILED
            }
        return Diagnosis(
            kind = kind,
            jcefClassesReachable = isJcefClassReachable(),
            jcefModulePresent = isJcefModulePluginPresent(),
            registryJcefEnabled = isRegistryJcefEnabled(),
            ideSummary = ideSummary(),
            detail = msg.ifBlank { error.javaClass.simpleName },
        )
    }

    /** Localized multi-line HTML body (no outer html/body) for the recovery panel. */
    fun buildGuidanceHtml(diagnosis: Diagnosis): String {
        val lines = mutableListOf<String>()
        lines += "<b>${escape(message("settings.web.jcef.title"))}</b>"
        lines += "<p>${escape(message("settings.web.jcef.intro"))}</p>"
        lines += "<p><b>${escape(message("settings.web.jcef.whatMissing"))}</b></p>"
        lines +=
            when (diagnosis.kind) {
                Kind.CLASSES_MISSING -> {
                    if (diagnosis.jcefModulePresent) {
                        "<p>${escape(message("settings.web.jcef.missing.modulePresentButClasses"))}</p>"
                    } else {
                        "<p>${escape(message("settings.web.jcef.missing.classes"))}</p>"
                    }
                }
                Kind.MOUNT_FAILED -> {
                    val reg = diagnosis.registryJcefEnabled
                    when {
                        reg == false ->
                            "<p>${escape(message("settings.web.jcef.missing.registryOff"))}</p>"
                        else ->
                            "<p>${escape(message("settings.web.jcef.missing.mountFailed"))}</p>"
                    }
                }
                Kind.BUNDLE_MISSING ->
                    "<p>${escape(message("settings.web.jcef.missing.bundle"))}</p>"
            }

        lines += "<p><b>${escape(message("settings.web.jcef.stepsTitle"))}</b></p>"
        lines += "<ol style='margin-top:4px'>"
        when (diagnosis.kind) {
            Kind.CLASSES_MISSING -> {
                lines += "<li>${escape(message("settings.web.jcef.step.enablePlugin"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.restart"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.jbr"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.registry"))}</li>"
            }
            Kind.MOUNT_FAILED -> {
                lines += "<li>${escape(message("settings.web.jcef.step.registry"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.enablePlugin"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.restart"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.jbr"))}</li>"
            }
            Kind.BUNDLE_MISSING -> {
                lines += "<li>${escape(message("settings.web.jcef.step.rebuild"))}</li>"
                lines += "<li>${escape(message("settings.web.jcef.step.reinstall"))}</li>"
            }
        }
        lines += "</ol>"

        lines += "<p><b>${escape(message("settings.web.jcef.noteCompletion"))}</b></p>"
        lines +=
            "<p style='color:#666;font-size:90%'>${escape(message("settings.web.jcef.env", diagnosis.ideSummary))}<br/>" +
                escape(
                    message(
                        "settings.web.jcef.envFlags",
                        yesNo(diagnosis.jcefClassesReachable),
                        yesNo(diagnosis.jcefModulePresent),
                        registryLabel(diagnosis.registryJcefEnabled),
                    ),
                ) +
                "</p>"

        diagnosis.detail?.takeIf { it.isNotBlank() }?.let { detail ->
            lines +=
                "<p style='color:#666;font-size:90%'><b>${escape(message("settings.web.jcef.detail"))}</b><br/>" +
                    "<code>${escape(detail)}</code></p>"
        }
        return lines.joinToString("")
    }

    private fun yesNo(value: Boolean): String =
        if (value) message("settings.web.jcef.yes") else message("settings.web.jcef.no")

    private fun registryLabel(value: Boolean?): String =
        when (value) {
            true -> message("settings.web.jcef.yes")
            false -> message("settings.web.jcef.no")
            null -> message("settings.web.jcef.unknown")
        }

    fun escape(text: String): String =
        text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")

    private fun canLoad(fqcn: String): Boolean =
        try {
            Class.forName(fqcn, false, JcefEnvironment::class.java.classLoader)
            true
        } catch (_: Throwable) {
            false
        }
}
