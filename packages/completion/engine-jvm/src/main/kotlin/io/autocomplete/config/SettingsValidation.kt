package io.autocomplete.config

import io.autocomplete.client.ProviderConfig
import io.autocomplete.util.Json
import java.net.URI

object SettingsValidation {
    private val VALID_HEADER_NAME_REGEX = Regex("""^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$""")

    private val SENSITIVE_HEADER_REGEX =
        Regex("""(auth|token|secret|key|cookie|credential|session|signature)""", RegexOption.IGNORE_CASE)

    val RESERVED_HEADER_NAMES: Set<String> =
        setOf(
            "authorization",
            "content-type",
            "accept",
            "host",
            "content-length",
            "transfer-encoding",
            "connection",
        )

    val SENSITIVE_HEADER_NAMES: Set<String> =
        setOf(
            "authorization",
            "proxy-authorization",
            "cookie",
            "set-cookie",
            "x-api-key",
            "api-key",
            "api_key",
            "x-auth-token",
            "x-access-token",
            "x-goog-api-key",
            "anthropic-api-key",
            "openai-api-key",
            "ocp-apim-subscription-key",
            "private-token",
            "x-token",
            "x-secret",
            "x-api-token",
            "x-csrf-token",
            "x-xsrf-token",
        )

    fun isLocalHost(host: String): Boolean {
        val h = host.trim().lowercase().removePrefix("[").removeSuffix("]")
        return h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "0.0.0.0"
    }

    fun isValidHeaderName(name: String): Boolean {
        val trimmed = name.trim()
        return trimmed.isNotEmpty() &&
            !containsCrlfOrNul(name) &&
            VALID_HEADER_NAME_REGEX.matches(trimmed)
    }

    fun isValidHeaderValue(value: String): Boolean = !containsCrlfOrNul(value)

    fun isBlockedExtraHeader(name: String): Boolean {
        val normalized = name.trim().lowercase()
        return normalized in RESERVED_HEADER_NAMES ||
            normalized in SENSITIVE_HEADER_NAMES ||
            SENSITIVE_HEADER_REGEX.containsMatchIn(normalized)
    }

    fun containsCrlfOrNul(text: String): Boolean =
        text.indexOf('\r') >= 0 || text.indexOf('\n') >= 0 || text.indexOf('\u0000') >= 0

    fun validate(
        baseUrl: String,
        model: String,
        timeoutMs: Int,
        settingsTimeoutMs: Int = ProviderConfig.DEFAULT_SETTINGS_TIMEOUT_MS,
        maxTokens: Int,
        maxPrefixChars: Int,
        maxSuffixChars: Int,
        allowRemote: Boolean,
        extraHeadersJson: String,
        /**
         * When false (no saved profile), blank baseUrl/model are allowed so global
         * settings can still be applied. Non-blank URLs are still format-checked.
         */
        requireConnection: Boolean = true,
        authHeaderTemplate: String = "",
        extraBodyJson: String = "",
        debounceMinMs: Int? = null,
        debounceInitialMs: Int? = null,
        debounceMaxMs: Int? = null,
    ): List<String> {
        val errors = mutableListOf<String>()
        val base = baseUrl.trim()
        if (requireConnection && base.isEmpty()) errors += "baseUrl is required"
        if (base.isNotEmpty()) {
            val uri = runCatching { URI.create(base) }.getOrNull()
            val scheme = uri?.scheme?.lowercase()
            if (uri == null || scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
                errors += "baseUrl must be a valid URL"
            } else if (scheme != "http" && scheme != "https") {
                errors += "baseUrl must use http or https"
            } else if (!uri.userInfo.isNullOrBlank()) {
                errors += "baseUrl must not contain user-info credentials"
            } else if (!allowRemote && !isLocalHost(uri.host)) {
                errors += "allowRemote=false but baseUrl is not localhost"
            }
        }
        if (requireConnection && model.isBlank()) errors += "model is required"
        if (timeoutMs !in ProviderConfig.MIN_TIMEOUT_MS..ProviderConfig.MAX_TIMEOUT_MS) {
            errors += "timeoutMs must be ${ProviderConfig.MIN_TIMEOUT_MS}..${ProviderConfig.MAX_TIMEOUT_MS}"
        }
        if (settingsTimeoutMs !in ProviderConfig.MIN_SETTINGS_TIMEOUT_MS..ProviderConfig.MAX_SETTINGS_TIMEOUT_MS) {
            errors +=
                "settingsTimeoutMs must be ${ProviderConfig.MIN_SETTINGS_TIMEOUT_MS}..${ProviderConfig.MAX_SETTINGS_TIMEOUT_MS}"
        }
        if (maxTokens !in 16..1024) errors += "maxTokens must be 16..1024"
        if (maxPrefixChars <= 0) errors += "maxPrefixChars must be > 0"
        if (maxSuffixChars <= 0) errors += "maxSuffixChars must be > 0"
        if (authHeaderTemplate.isNotBlank()) {
            if (containsCrlfOrNul(authHeaderTemplate)) {
                errors += "authHeaderTemplate must not contain CR/LF characters"
            } else if (!authHeaderTemplate.contains("\${apiKey}")) {
                errors += "authHeaderTemplate must include \${apiKey} placeholder"
            }
        }
        if (extraHeadersJson.isNotBlank()) {
            runCatching { Json.parseObject(extraHeadersJson) }
                .onSuccess { headers ->
                    var hasBlocked = false
                    var hasInvalid = false
                    for ((key, value) in headers) {
                        val text = value?.toString().orEmpty()
                        if (!isValidHeaderName(key) || !isValidHeaderValue(text)) {
                            hasInvalid = true
                        }
                        if (isBlockedExtraHeader(key)) {
                            hasBlocked = true
                        }
                    }
                    if (hasInvalid) errors += "extraHeadersJson contains invalid header name or value"
                    if (hasBlocked) errors += "extraHeadersJson must not contain credential or reserved headers"
                }
                .onFailure { errors += "extraHeadersJson must be a JSON object" }
        }
        if (extraBodyJson.isNotBlank()) {
            runCatching { Json.parseObject(extraBodyJson) }
                .onFailure { errors += "extraBodyJson must be a JSON object" }
        }
        if (debounceMinMs != null && debounceMinMs < 0) errors += "debounceMinMs must be >= 0"
        if (debounceInitialMs != null && debounceInitialMs < 0) errors += "debounceInitialMs must be >= 0"
        if (debounceMaxMs != null && debounceMaxMs < 0) errors += "debounceMaxMs must be >= 0"
        if (debounceMinMs != null && debounceInitialMs != null && debounceMinMs > debounceInitialMs) {
            errors += "debounceMinMs must be <= debounceInitialMs"
        }
        if (debounceInitialMs != null && debounceMaxMs != null && debounceInitialMs > debounceMaxMs) {
            errors += "debounceInitialMs must be <= debounceMaxMs"
        }
        if (debounceMinMs != null && debounceMaxMs != null && debounceMinMs > debounceMaxMs) {
            errors += "debounceMinMs must be <= debounceMaxMs"
        }
        return errors
    }
}
