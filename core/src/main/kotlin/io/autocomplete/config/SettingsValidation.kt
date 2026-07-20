package io.autocomplete.config

import io.autocomplete.client.ProviderConfig
import io.autocomplete.util.Json
import java.net.URI

object SettingsValidation {
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
    ): List<String> {
        val errors = mutableListOf<String>()
        val base = baseUrl.trim()
        if (requireConnection && base.isEmpty()) errors += "baseUrl is required"
        if (base.isNotEmpty()) {
            val uri = runCatching { URI.create(base) }.getOrNull()
            if (uri == null || uri.scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
                errors += "baseUrl must be a valid URL"
            } else if (!allowRemote) {
                val host = uri.host.lowercase()
                val local = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0"
                if (!local) errors += "allowRemote=false but baseUrl is not localhost"
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
        if (extraHeadersJson.isNotBlank()) {
            runCatching { Json.parseObject(extraHeadersJson) }
                .onFailure { errors += "extraHeadersJson must be a JSON object" }
        }
        return errors
    }
}
