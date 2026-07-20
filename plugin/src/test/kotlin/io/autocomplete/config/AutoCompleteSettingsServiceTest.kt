package io.autocomplete.config

import com.intellij.testFramework.fixtures.BasePlatformTestCase

class AutoCompleteSettingsServiceTest : BasePlatformTestCase() {
    fun testInvalidCandidateDoesNotMutateStatePasswordOrListeners() {
        val service = AutoCompleteSettingsService()
        val before = service.snapshot()
        val beforeApiKey = service.getApiKey()
        var notifications = 0
        service.addListener { notifications++ }

        val errors =
            service.applyValidated(
                before.copy(
                    baseUrl = "not a url",
                    maxTokens = 1,
                    extraHeadersJson = "[]",
                ),
                apiKey = "must-not-be-written",
            )

        assertTrue(errors.isNotEmpty())
        assertEquals(before, service.snapshot())
        assertEquals(beforeApiKey, service.getApiKey())
        assertEquals(0, notifications)
    }

    fun testValidCandidateCommitsAndNotifiesOnce() {
        val service = AutoCompleteSettingsService()
        val currentApiKey = service.getApiKey()
        var notifications = 0
        service.addListener { notifications++ }
        val candidate = service.snapshot().copy(model = "new-model")

        val errors = service.applyValidated(candidate, currentApiKey)

        assertTrue(errors.isEmpty())
        assertEquals("new-model", service.snapshot().model)
        assertEquals(1, notifications)
    }
}
