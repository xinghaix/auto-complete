package io.autocomplete.i18n

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale
import java.util.ResourceBundle

class AutoCompleteBundleTest {
    private val baseName = "messages.AutoCompleteBundle"
    private val control = ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_DEFAULT)

    @Test
    fun chineseJapaneseAndKoreanBundlesContainEveryEnglishKey() {
        val english = bundle(Locale.ENGLISH)
        val englishKeys = english.keySet()

        listOf(Locale.CHINESE, Locale.JAPANESE, Locale.KOREAN).forEach { locale ->
            val localized = bundle(locale)
            assertTrue("missing keys for $locale", localized.keySet().containsAll(englishKeys))
            assertNotEquals(english.getString("settings.enable"), localized.getString("settings.enable"))
        }
    }

    @Test
    fun unsupportedLanguageFallsBackToEnglishBaseBundle() {
        val english = bundle(Locale.ENGLISH)
        val unsupported = bundle(Locale.FRENCH)

        assertEquals(english.getString("settings.enable"), unsupported.getString("settings.enable"))
        assertEquals(english.getString("action.AutoComplete.Trigger.text"), unsupported.getString("action.AutoComplete.Trigger.text"))
    }

    private fun bundle(locale: Locale): ResourceBundle =
        ResourceBundle.getBundle(baseName, locale, javaClass.classLoader, control)
}
