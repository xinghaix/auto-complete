package io.autocomplete.i18n

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.ResourceBundle

class AutoCompleteBundleTest {
    private val baseName = "messages.AutoCompleteBundle"
    private val control = ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_DEFAULT)

    @Test
    fun allFourLocaleBundlesHaveExactKeyParityAndLocalizedValues() {
        val english = bundle(Locale.ENGLISH)
        val englishKeys = english.keySet()
        assertTrue(englishKeys.isNotEmpty())

        val requiredKeys =
            listOf(
                "name",
                "notification.group.name",
                "action.AutoComplete.OpenSettings.description",
                "action.AutoComplete.OpenLogs.description",
                "settings.web.jcefDisabled",
                "settings.web.jcefUnavailable",
                "settings.web.jcefFailed",
                "settings.web.bundleMissing",
                "settings.web.jcef.missing.legacyJbr",
                "settings.web.jcef.missing.splitPlugin",
                "status.menu.profiles",
                "status.menu.snooze15m",
                "status.menu.clearCaches",
            )
        for (key in requiredKeys) {
            assertTrue("English bundle missing key '$key'", englishKeys.contains(key))
            assertFalse("English bundle blank value for '$key'", english.getString(key).isBlank())
        }

        listOf(Locale.CHINESE, Locale.JAPANESE, Locale.KOREAN).forEach { locale ->
            val localized = bundle(locale)
            val missing = englishKeys - localized.keySet()
            val extra = localized.keySet() - englishKeys
            assertEquals("Missing keys for $locale: $missing", emptySet<String>(), missing)
            assertEquals("Unexpected extra keys for $locale: $extra", emptySet<String>(), extra)
            for (key in englishKeys) {
                assertFalse("Blank value for '$key' in $locale", localized.getString(key).isBlank())
            }
            assertNotEquals(
                english.getString("action.AutoComplete.Trigger.text"),
                localized.getString("action.AutoComplete.Trigger.text"),
            )
            assertNotEquals(
                english.getString("status.menu.openSettings"),
                localized.getString("status.menu.openSettings"),
            )
        }
    }

    @Test
    fun allPropertiesFilesHaveCleanKeyEqualsValueSyntax() {
        val files =
            listOf(
                "messages/AutoCompleteBundle.properties",
                "messages/AutoCompleteBundle_zh.properties",
                "messages/AutoCompleteBundle_ja.properties",
                "messages/AutoCompleteBundle_ko.properties",
            )
        for (resource in files) {
            val stream =
                javaClass.classLoader.getResourceAsStream(resource)
                    ?: error("Resource not found: $resource")
            val lines =
                stream.use { it.bufferedReader(StandardCharsets.UTF_8).readLines() }
            lines.forEachIndexed { idx, raw ->
                val line = raw.trim()
                if (line.isEmpty() || line.startsWith("#")) return@forEachIndexed
                val eq = line.indexOf('=')
                assertTrue(
                    "Malformed properties line in $resource:${idx + 1}: $raw",
                    eq > 0 && eq < line.length - 1,
                )
            }
        }
    }

    @Test
    fun unsupportedLanguageFallsBackToEnglishBaseBundle() {
        val english = bundle(Locale.ENGLISH)
        val unsupported = bundle(Locale.FRENCH)

        assertEquals(english.getString("status.menu.openSettings"), unsupported.getString("status.menu.openSettings"))
        assertEquals(english.getString("action.AutoComplete.Trigger.text"), unsupported.getString("action.AutoComplete.Trigger.text"))
    }

    private fun bundle(locale: Locale): ResourceBundle =
        ResourceBundle.getBundle(baseName, locale, javaClass.classLoader, control)
}
