package io.autocomplete.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

class JcefEnvironmentTest {
    @Test
    fun diagnoseMountFailure_detectsMissingBundle() {
        val d =
            JcefEnvironment.diagnoseMountFailure(
                IllegalStateException("settings-ui bundle not found: index.html"),
            )
        assertEquals(JcefEnvironment.Kind.BUNDLE_MISSING, d.kind)
        assertTrue(d.detail!!.contains("settings-ui"))
    }

    @Test
    fun diagnoseMountFailure_defaultsToMountFailed() {
        val d =
            JcefEnvironment.diagnoseMountFailure(
                IllegalStateException("JBCefApp.isSupported() == false"),
            )
        assertEquals(JcefEnvironment.Kind.MOUNT_FAILED, d.kind)
    }

    @Test
    fun escape_htmlSpecialCharacters() {
        assertEquals(
            "&lt;b&gt;x &amp; y&lt;/b&gt; &quot;z&quot;",
            JcefEnvironment.escape("<b>x & y</b> \"z\""),
        )
    }

    @Test
    fun buildGuidanceHtml_legacyBaseline242UsesJbrGuidanceNotSplitPlugin() {
        val diagnosis =
            JcefEnvironment.Diagnosis(
                kind = JcefEnvironment.Kind.CLASSES_MISSING,
                jcefClassesReachable = false,
                jcefModulePresent = false,
                registryJcefEnabled = null,
                ideSummary = "IntelliJ IDEA 2024.2 · build IC-242.1 · macOS",
                baselineVersion = 242,
            )
        val html = JcefEnvironment.buildGuidanceHtml(diagnosis, mutedColorHex = "888888")
        assertTrue(html.contains("<ol"))
        assertTrue(html.contains("2024.2") || html.contains("IC-242.1"))
        assertTrue(html.contains("JBR") || html.contains("JetBrains Runtime"))
        assertTrue(html.contains("color:#888888"))
        assertFalse("Should not contain hardcoded #666", html.contains("#666"))
        assertFalse(html.contains("<script"))
    }

    @Test
    fun buildGuidanceHtml_baseline262DisabledBundledPluginInstructsEnablingWebBrowser() {
        val diagnosis =
            JcefEnvironment.Diagnosis(
                kind = JcefEnvironment.Kind.CLASSES_MISSING,
                jcefClassesReachable = false,
                jcefModulePresent = true,
                registryJcefEnabled = true,
                ideSummary = "IntelliJ IDEA 2026.2 · build IU-262.100 · macOS",
                baselineVersion = 262,
                jcefPluginDisabled = true,
            )
        val html = JcefEnvironment.buildGuidanceHtml(diagnosis, mutedColorHex = "9aa0a6")
        assertTrue(html.contains("Web Browser (JCEF)"))
        assertTrue(html.contains("2026.2"))
        assertTrue(html.contains("color:#9aa0a6"))
        assertFalse(html.contains("#666"))
    }

    @Test
    fun buildGuidanceHtml_mountFailedWithRegistryOff() {
        val diagnosis =
            JcefEnvironment.Diagnosis(
                kind = JcefEnvironment.Kind.MOUNT_FAILED,
                jcefClassesReachable = true,
                jcefModulePresent = true,
                registryJcefEnabled = false,
                ideSummary = "test-ide",
                detail = "JBCefApp.isSupported() == false",
                baselineVersion = 253,
            )
        val html = JcefEnvironment.buildGuidanceHtml(diagnosis)
        assertTrue(html.contains("JBCefApp.isSupported"))
        assertTrue(html.contains("test-ide"))
    }

    @Test
    fun statusBarFormattingFormatsReadableLocalTimeInsteadOfEpochMs() {
        val now = Instant.parse("2026-08-01T10:00:00Z").toEpochMilli()
        val until = Instant.parse("2026-08-01T10:30:00Z").toEpochMilli()
        val formatted = StatusBarFormatting.formatSnoozeUntil(until, nowMs = now, zoneId = ZoneOffset.UTC)
        assertEquals("10:30 (30m)", formatted)
        assertFalse(formatted.contains(until.toString()))
    }
}
