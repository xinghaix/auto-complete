package io.autocomplete.config

import com.intellij.credentialStore.Credentials
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.autocomplete.prompt.PromptTemplate

class AutoCompleteSettingsServiceTest : BasePlatformTestCase() {
    override fun tearDown() {
        try {
            val svc = AutoCompleteSettingsService()
            PasswordSafe.instance.set(svc.legacyCredentialAttributes(), null)
        } finally {
            super.tearDown()
        }
    }

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

    fun testLegacyApiKeyMigrationDeletesLegacyCredentialAndNeverFallsBack() {
        val service = AutoCompleteSettingsService()
        PasswordSafe.instance.set(service.legacyCredentialAttributes(), Credentials("auto-complete", "legacy-secret-123"))

        service.ensureProfilesMigrated()
        val migratedProfile = service.activeProfile()
        assertNotNull(migratedProfile)
        assertEquals("legacy-secret-123", service.getApiKey())
        assertTrue(service.hasApiKeyFor(migratedProfile!!.id))

        // Legacy single-key entry must have been deleted immediately upon migration.
        assertNull(PasswordSafe.instance.getPassword(service.legacyCredentialAttributes()))

        // Even if a legacy key reappears externally, getApiKey() must NEVER fall back once profiles exist.
        val localProfile = service.createProfile("Local Ollama", preset = "ollama")
        PasswordSafe.instance.set(service.legacyCredentialAttributes(), Credentials("auto-complete", "stale-legacy-secret"))
        assertEquals("", service.getApiKey())
        assertFalse(service.hasApiKeyFor(localProfile.id))

        // Clearing active profile secret leaves it empty without fallback.
        service.selectProfile(migratedProfile.id)
        service.clearApiKeyForProfile(migratedProfile.id)
        assertEquals("", service.getApiKey())
        assertFalse(service.hasApiKeyFor(migratedProfile.id))
    }

    fun testProviderConfigForDoesNotMutateActiveProfileAndMapsExtraBodyAndStopSequences() {
        val service = AutoCompleteSettingsService()
        val first = service.activeProfile()!!
        val second = service.createProfile("DeepSeek", preset = "deepseek-beta")
        service.update {
            model = "deepseek-chat"
            extraBodyJson = """{"top_p":0.9}"""
            stopSequences = "\n\n, END"
        }
        service.selectProfile(first.id)
        assertEquals(first.id, service.activeProfileId())

        val cfg = service.providerConfigFor(second.id)
        assertEquals("https://api.deepseek.com/beta", cfg.baseUrl)
        assertEquals("deepseek-chat", cfg.model)
        assertEquals(PromptTemplate.CODESTRAL_API, cfg.promptTemplate)
        assertEquals("""{"top_p":0.9}""", cfg.extraBodyJson)
        assertEquals("\n\n, END", cfg.stopSequences)
        // Global activeProfileId must remain unchanged.
        assertEquals(first.id, service.activeProfileId())
    }

    fun testValidateChecksEffectiveContextBudgetIgnoresLegacyAllowRemoteAndValidatesSecurityFields() {
        val service = AutoCompleteSettingsService()
        val base = service.snapshot()

        // Legacy allowRemote=false should be ignored for remote URLs.
        val remoteOk =
            service.validate(
                base.copy(
                    baseUrl = "https://api.example.com/v1",
                    model = "codestral-latest",
                    allowRemote = false,
                ),
            )
        assertTrue("Legacy allowRemote=false should be ignored, got $remoteOk", remoteOk.isEmpty())

        // Effective profile context budget should be validated when overrideContextBudget=true.
        val badOverride =
            service.validate(
                base.copy(
                    overrideContextBudget = true,
                    profileMaxPrefixChars = 0,
                    profileMaxSuffixChars = -1,
                ),
            )
        assertTrue(badOverride.any { it.contains("maxPrefixChars") })
        assertTrue(badOverride.any { it.contains("maxSuffixChars") })

        // Raw authHeaderTemplate without ${apiKey}, bad extraBodyJson, and bad debounce order must fail.
        val badSecurity =
            service.validate(
                base.copy(
                    authHeaderTemplate = "Authorization: Bearer hardcoded-token",
                    extraBodyJson = "[1, 2, 3]",
                    debounceMinMs = 500,
                    debounceInitialMs = 200,
                    debounceMaxMs = 100,
                ),
            )
        assertTrue(badSecurity.any { it.contains("authHeaderTemplate") })
        assertTrue(badSecurity.any { it.contains("extraBodyJson") })
        assertTrue(badSecurity.any { it.contains("debounce") })
    }

    fun testToggleLanguageDisabledUpdatesSetCleanly() {
        val service = AutoCompleteSettingsService()
        assertTrue(service.toggleLanguageDisabled("markdown"))
        assertTrue("markdown" in service.disabledLanguageSet())
        assertFalse(service.toggleLanguageDisabled("MARKDOWN"))
        assertFalse("markdown" in service.disabledLanguageSet())
    }
}
