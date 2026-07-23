package io.autocomplete.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SettingsExportTest {
    @Test
    fun redactOmitsSecretMarkersAndExtraHeadersButKeepsPortableProfileFields() {
        val exported =
            SettingsExport.redact(
                mapOf(
                    "schemaVersion" to 1,
                    "profiles" to
                        listOf(
                            mapOf(
                                "id" to "profile-1",
                                "name" to "Gateway",
                                "baseUrl" to "https://example.test/v1",
                                "apiKey" to "must-not-escape",
                                "hasApiKey" to true,
                                "authHeaderTemplate" to "X-API-Key: must-not-escape",
                                "extraHeadersJson" to "{\"X-API-Key\":\"must-not-escape\"}",
                            ),
                        ),
                ),
            )

        @Suppress("UNCHECKED_CAST")
        val profile = (exported["profiles"] as List<Map<String, Any?>>).single()
        assertEquals("profile-1", profile["id"])
        assertEquals("Gateway", profile["name"])
        assertEquals("https://example.test/v1", profile["baseUrl"])
        assertFalse(profile.containsKey("apiKey"))
        assertFalse(profile.containsKey("hasApiKey"))
        assertFalse(profile.containsKey("authHeaderTemplate"))
        assertFalse(profile.containsKey("extraHeadersJson"))
    }
}
