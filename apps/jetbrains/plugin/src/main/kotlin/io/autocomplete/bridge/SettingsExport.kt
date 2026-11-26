package io.autocomplete.bridge

import io.autocomplete.util.Json

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

    /** Pretty-print JSON with 2-space indentation for parity with VS Code `JSON.stringify(x, null, 2)`. */
    fun toPrettyJson(value: Any?): String = buildString { appendPretty(value, indent = 0) }

    private fun StringBuilder.appendPretty(
        value: Any?,
        indent: Int,
    ) {
        when (value) {
            null -> append("null")
            is Boolean -> append(value.toString())
            is Double -> {
                require(value.isFinite()) { "Non-finite JSON number: $value" }
                append(value.toString())
            }
            is Float -> {
                require(value.isFinite()) { "Non-finite JSON number: $value" }
                append(value.toString())
            }
            is Number -> append(value.toString())
            is Map<*, *> -> {
                if (value.isEmpty()) {
                    append("{}")
                    return
                }
                append("{\n")
                val entries = value.entries.toList()
                val childIndent = indent + 2
                entries.forEachIndexed { idx, (k, v) ->
                    appendSpaces(childIndent)
                    append('"').append(Json.escape(k.toString())).append("\": ")
                    appendPretty(v, childIndent)
                    if (idx < entries.lastIndex) append(',')
                    append('\n')
                }
                appendSpaces(indent)
                append('}')
            }
            is List<*> -> {
                if (value.isEmpty()) {
                    append("[]")
                    return
                }
                append("[\n")
                val childIndent = indent + 2
                value.forEachIndexed { idx, item ->
                    appendSpaces(childIndent)
                    appendPretty(item, childIndent)
                    if (idx < value.lastIndex) append(',')
                    append('\n')
                }
                appendSpaces(indent)
                append(']')
            }
            else -> append('"').append(Json.escape(value.toString())).append('"')
        }
    }

    private fun StringBuilder.appendSpaces(n: Int) {
        repeat(n) { append(' ') }
    }

    val EXCLUDED_PROFILE_FIELDS: Set<String> =
        setOf("apiKey", "hasApiKey", "authHeaderTemplate", "extraHeadersJson")
}
