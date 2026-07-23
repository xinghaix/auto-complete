package io.autocomplete.bridge

/**
 * Produces the portable settings export shared by the JCEF bridge.
 *
 * API-key state and arbitrary extra headers must never leave the local host:
 * header values can carry credentials even when they are not named "apiKey".
 */
object SettingsExport {
    fun redact(snapshot: Map<String, Any?>): Map<String, Any?> {
        val profiles = snapshot["profiles"] as? List<*> ?: return snapshot
        val sanitizedProfiles =
            profiles.mapNotNull { item ->
                val profile = item as? Map<*, *> ?: return@mapNotNull null
                profile.entries
                    .associate { it.key.toString() to it.value }
                    .filterKeys { it !in EXCLUDED_PROFILE_FIELDS }
            }
        return snapshot + ("profiles" to sanitizedProfiles)
    }

    private val EXCLUDED_PROFILE_FIELDS =
        setOf("apiKey", "hasApiKey", "authHeaderTemplate", "extraHeadersJson")
}
