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

    @Test
    fun validatesSchemeIpv6LoopbackUserInfoAuthTemplateHeadersExtraBodyAndDebounce() {
        // IPv6 loopback accepted when allowRemote=false
        val ipv6Ok =
            SettingsValidation.validate(
                baseUrl = "http://[::1]:11434/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = false,
                extraHeadersJson = """{"X-Tenant-Id":"team-a"}""",
                authHeaderTemplate = "Authorization: Bearer \${apiKey}",
                extraBodyJson = """{"top_p":0.95}""",
                debounceMinMs = 0,
                debounceInitialMs = 200,
                debounceMaxMs = 1000,
            )
        assertTrue(ipv6Ok.isEmpty(), ipv6Ok.toString())

        // Non-http(s) scheme rejected
        val badScheme =
            SettingsValidation.validate(
                baseUrl = "file://localhost/etc/passwd",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = "{}",
            )
        assertTrue(badScheme.any { it.contains("http or https") }, badScheme.toString())

        // userInfo rejected
        val userInfo =
            SettingsValidation.validate(
                baseUrl = "https://user:pass@api.example.com/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = "{}",
            )
        assertTrue(userInfo.any { it.contains("user-info") }, userInfo.toString())

        // Hardcoded authHeaderTemplate without ${apiKey} rejected
        val hardcodedAuth =
            SettingsValidation.validate(
                baseUrl = "http://127.0.0.1:11434/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = "{}",
                authHeaderTemplate = "Authorization: Bearer sk-hardcoded",
            )
        assertTrue(hardcodedAuth.any { it.contains("\${apiKey}") }, hardcodedAuth.toString())

        // Broad sensitive headers, reserved headers, malformed JSON, bad extraBodyJson, inverted debounce rejected
        val badSecurityAndRanges =
            SettingsValidation.validate(
                baseUrl = "http://127.0.0.1:11434/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = """{"Anthropic-Api-Key":"k","Content-Type":"text/plain"}""",
                extraBodyJson = "[1,2,3]",
                debounceMinMs = 500,
                debounceInitialMs = 300,
                debounceMaxMs = 200,
            )
        assertTrue(badSecurityAndRanges.any { it.contains("credential or reserved") }, badSecurityAndRanges.toString())
        assertTrue(badSecurityAndRanges.any { it.contains("extraBodyJson") }, badSecurityAndRanges.toString())
        assertTrue(badSecurityAndRanges.any { it.contains("debounceMinMs") }, badSecurityAndRanges.toString())
        assertTrue(badSecurityAndRanges.any { it.contains("debounceInitialMs") }, badSecurityAndRanges.toString())

        // Malformed extraHeadersJson rejected strictly
        val badJson =
            SettingsValidation.validate(
                baseUrl = "http://127.0.0.1:11434/v1",
                model = "qwen",
                timeoutMs = 2500,
                maxTokens = 128,
                maxPrefixChars = 8000,
                maxSuffixChars = 2000,
                allowRemote = true,
                extraHeadersJson = """{"X-Test": broken}""",
            )
        assertTrue(badJson.any { it.contains("JSON object") }, badJson.toString())
    }
}
