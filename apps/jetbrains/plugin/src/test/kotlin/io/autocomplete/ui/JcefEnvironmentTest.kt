package io.autocomplete.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

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
    fun buildGuidanceHtml_includesStepsAndDoesNotThrow() {
        val diagnosis =
            JcefEnvironment.Diagnosis(
                kind = JcefEnvironment.Kind.CLASSES_MISSING,
                jcefClassesReachable = false,
                jcefModulePresent = false,
                registryJcefEnabled = null,
                ideSummary = "IntelliJ IDEA 2024.2 · build IC-242.1 · macOS",
            )
        val html = JcefEnvironment.buildGuidanceHtml(diagnosis)
        assertTrue(html.contains("<ol"))
        assertTrue(html.contains("JCEF") || html.contains("jcef") || html.contains("浏览器") || html.contains("ブラウザ"))
        assertFalse(html.contains("<script"))
        // User-facing detail should be escaped if present later; env line is present.
        assertTrue(html.contains("IC-242.1") || html.contains("2024.2"))
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
            )
        val html = JcefEnvironment.buildGuidanceHtml(diagnosis)
        assertTrue(html.contains("JBCefApp.isSupported"))
        assertTrue(html.contains("test-ide"))
    }
}
