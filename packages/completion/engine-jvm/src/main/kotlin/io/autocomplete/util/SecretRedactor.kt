package io.autocomplete.util

import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Redacts credentials from URLs, headers, and error/log text before logging or returning diagnostics.
 */
object SecretRedactor {
    private val SENSITIVE_QUERY_KEY_REGEX =
        Regex("""(key|token|secret|auth|pass|credential|sig|signature|session)""", RegexOption.IGNORE_CASE)

    private val AUTH_SCHEME_VALUE_REGEX =
        Regex("""(?i)\b(Bearer|Basic)\s+[^\s"',;}\]]+""")

    private val AUTH_TOKEN_HEADER_REGEX =
        Regex("""(?i)(Authorization\s*:\s*Token)\s+[^\s"',;}\]]+""")

    private val INLINE_QUERY_SECRET_REGEX =
        Regex(
            """([?&](?:api[-_]?key|key|access[-_]?token|auth[-_]?token|token|secret|auth|password|sig|signature)=)[^&\s"'<>]+""",
            RegexOption.IGNORE_CASE,
        )

    private val INLINE_USERINFO_REGEX =
        Regex("""(https?://)[^/\s@]+@""", RegexOption.IGNORE_CASE)

    fun redactUrl(url: String): String {
        val raw = url.trim()
        if (raw.isEmpty()) return ""
        val uri = runCatching { URI.create(raw) }.getOrNull()
        if (uri == null || uri.scheme.isNullOrBlank() || uri.rawAuthority.isNullOrBlank()) {
            return raw
                .replace(INLINE_USERINFO_REGEX, "$1")
                .replace(INLINE_QUERY_SECRET_REGEX, "$1[REDACTED]")
        }
        val authority =
            if (uri.rawUserInfo != null) {
                val atIdx = uri.rawAuthority.indexOf('@')
                if (atIdx >= 0) uri.rawAuthority.substring(atIdx + 1) else uri.rawAuthority
            } else {
                uri.rawAuthority
            }
        val query =
            uri.rawQuery?.let { q ->
                if (q.isEmpty()) {
                    ""
                } else {
                    "?" +
                        q.split('&').joinToString("&") { part ->
                            val eq = part.indexOf('=')
                            if (eq < 0) {
                                part
                            } else {
                                val k = part.substring(0, eq)
                                if (SENSITIVE_QUERY_KEY_REGEX.containsMatchIn(k)) {
                                    "$k=[REDACTED]"
                                } else {
                                    part
                                }
                            }
                        }
                }
            }.orEmpty()
        val path = uri.rawPath.orEmpty()
        val fragment = uri.rawFragment?.let { "#$it" }.orEmpty()
        return "${uri.scheme}://$authority$path$query$fragment"
    }

    fun redactText(
        text: String,
        knownSecret: String = "",
    ): String {
        if (text.isEmpty()) return ""
        var out = text
        val secret = knownSecret.trim()
        if (secret.isNotEmpty()) {
            out = out.replace(secret, "[REDACTED]")
            val encoded = runCatching { URLEncoder.encode(secret, StandardCharsets.UTF_8) }.getOrNull()
            if (!encoded.isNullOrEmpty() && encoded != secret) {
                out = out.replace(encoded, "[REDACTED]")
            }
        }
        out = out.replace(AUTH_SCHEME_VALUE_REGEX, "$1 [REDACTED]")
        out = out.replace(AUTH_TOKEN_HEADER_REGEX, "$1 [REDACTED]")
        out = out.replace(INLINE_USERINFO_REGEX, "$1")
        out = out.replace(INLINE_QUERY_SECRET_REGEX, "$1[REDACTED]")
        return out
    }
}
