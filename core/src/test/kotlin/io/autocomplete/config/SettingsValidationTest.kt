package io.autocomplete.config

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SettingsValidationTest {
    @Test
    fun acceptsLocalDefaults() {
        val errors =
            SettingsValidation.validate(
                baseUrl = "http://127.0.0.1:11434/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = false,
                extraHeadersJson = "{}",
            )
        assertTrue(errors.isEmpty(), errors.toString())
    }

    @Test
    fun rejectsRemoteWhenNotAllowed() {
        val errors =
            SettingsValidation.validate(
                baseUrl = "https://api.example.com/v1",
                model = "x",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 100,
                maxSuffixChars = 100,
                allowRemote = false,
                extraHeadersJson = "{}",
            )
        assertTrue(errors.any { it.contains("allowRemote") })
    }

    @Test
    fun rejectsBadRanges() {
        val errors =
            SettingsValidation.validate(
                baseUrl = "not-a-url",
                model = "",
                timeoutMs = 10,
                maxTokens = 1,
                maxPrefixChars = 0,
                maxSuffixChars = 0,
                allowRemote = true,
                extraHeadersJson = "[]",
            )
        assertTrue(errors.size >= 4)
    }

    @Test
    fun allowsBlankConnectionWhenNotRequired() {
        val errors =
            SettingsValidation.validate(
                baseUrl = "",
                model = "",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = "{}",
                requireConnection = false,
            )
        assertTrue(errors.isEmpty(), errors.toString())
    }
}
