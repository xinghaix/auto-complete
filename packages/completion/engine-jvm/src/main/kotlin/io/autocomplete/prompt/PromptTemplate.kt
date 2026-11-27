package io.autocomplete.prompt

import io.autocomplete.client.ProviderKind
import java.net.URI

/**
 * How the completion request is serialized on the wire.
 */
enum class WireFormat {
    /** OpenAI-compatible FIM API: JSON fields `prompt` + `suffix` (Codestral, DeepSeek Beta FIM, etc.). */
    FIM_FIELDS,

    /** OpenAI completions style: single `prompt` string (token FIM). */
    COMPLETION_PROMPT,

    /** OpenAI chat style: `messages` array. */
    CHAT_MESSAGES,

    /** Native OpenAI Responses API: `instructions` + `input` + `max_output_tokens` on `/responses`. */
    RESPONSES_API,
}

/**
 * Common completion prompt templates users can pick and probe.
 *
 * [AUTO] resolves at request time via [PromptTemplateDetector].
 */
enum class PromptTemplate {
    AUTO,
    CODESTRAL_API,
    QWEN,
    DEEPSEEK,
    STARCODER,
    CODELLAMA,
    CHAT,
    RESPONSES,
    ;

    fun isAuto(): Boolean = this == AUTO

    fun wireFormat(): WireFormat =
        when (this) {
            AUTO -> WireFormat.CHAT_MESSAGES
            CODESTRAL_API -> WireFormat.FIM_FIELDS
            QWEN, DEEPSEEK, STARCODER, CODELLAMA -> WireFormat.COMPLETION_PROMPT
            CHAT -> WireFormat.CHAT_MESSAGES
            RESPONSES -> WireFormat.RESPONSES_API
        }

    /** Stable short label for logs / defaults (English). */
    fun shortLabel(): String =
        when (this) {
            AUTO -> "Auto"
            CODESTRAL_API -> "(fim) OpenAI FIM"
            QWEN -> "(fim) Qwen"
            DEEPSEEK -> "(fim) DeepSeek"
            STARCODER -> "(fim) StarCoder"
            CODELLAMA -> "(fim) CodeLlama"
            CHAT -> "(chat) Pseudo-FIM"
            RESPONSES -> "(responses) OpenAI Responses"
        }

    fun stopTokens(): List<String> =
        when (this) {
            QWEN ->
                listOf(
                    "<|endoftext|>",
                    "<|fim_prefix|>",
                    "<|fim_middle|>",
                    "<|fim_suffix|>",
                    "<|fim_pad|>",
                    "<|repo_name|>",
                    "<|file_sep|>",
                    "<|im_end|>",
                )
            DEEPSEEK ->
                listOf(
                    "<｜fim▁begin｜>",
                    "<｜fim▁hole｜>",
                    "<｜fim▁end｜>",
                    "<|EOT|>",
                    "<｜end▁of▁sentence｜>",
                )
            STARCODER ->
                listOf(
                    "<|endoftext|>",
                    "<fim_prefix>",
                    "<fim_middle>",
                    "<fim_suffix>",
                    "<fim_pad>",
                    "<file_sep>",
                    "<|eos|>",
                )
            CODELLAMA ->
                listOf(
                    "<EOT>",
                    "<PRE>",
                    "<SUF>",
                    "<MID>",
                    "</s>",
                    "<|endoftext|>",
                )
            else -> emptyList()
        }

    /**
     * Build the model-facing prompt text for token-style templates.
     * For [CODESTRAL_API] / [CHAT] the client uses structured fields instead.
     */
    fun formatTokenPrompt(
        prefix: String,
        suffix: String,
    ): String =
        when (this) {
            QWEN -> "<|fim_prefix|>$prefix<|fim_suffix|>$suffix<|fim_middle|>"
            DEEPSEEK -> "<｜fim▁begin｜>$prefix<｜fim▁hole｜>$suffix<｜fim▁end｜>"
            STARCODER -> "<fim_prefix>$prefix<fim_suffix>$suffix<fim_middle>"
            CODELLAMA -> "<PRE>$prefix<SUF>$suffix<MID>"
            AUTO, CODESTRAL_API, CHAT, RESPONSES -> prefix
        }

    companion object {
        fun fromStored(value: String?): PromptTemplate {
            if (value.isNullOrBlank()) return AUTO
            return runCatching { valueOf(value.trim().uppercase()) }.getOrDefault(AUTO)
        }

        /** Concrete templates users can probe (excludes AUTO). */
        fun probeCandidates(): List<PromptTemplate> =
            listOf(CODESTRAL_API, QWEN, DEEPSEEK, STARCODER, CODELLAMA, CHAT, RESPONSES)

        /**
         * Migrate legacy requestStyle setting into a template when promptTemplate is absent.
         */
        fun fromLegacyRequestStyle(requestStyle: String?): PromptTemplate =
            when (requestStyle?.uppercase()) {
                "FIM" -> CODESTRAL_API
                "CHAT" -> CHAT
                else -> AUTO
            }
    }
}

object PromptTemplateDetector {
    internal val OPENAI_REASONING_REGEX = Regex("""(?:^|[-_/:])o[134](?:$|[-_.:])""")

    fun isDeepSeekBetaUrl(baseUrl: String): Boolean {
        val uri = runCatching { URI.create(baseUrl.trim()) }.getOrNull() ?: return false
        val host = uri.host?.lowercase().orEmpty()
        val path = uri.path.orEmpty().trimEnd('/').lowercase()
        return (host == "deepseek.com" || host.endsWith(".deepseek.com")) &&
            (path == "/beta" || path.endsWith("/beta"))
    }

    fun isMistralUrl(baseUrl: String): Boolean {
        val uri = runCatching { URI.create(baseUrl.trim()) }.getOrNull() ?: return false
        val host = uri.host?.lowercase().orEmpty()
        return host == "mistral.ai" || host.endsWith(".mistral.ai")
    }

    fun detect(
        model: String,
        providerKind: ProviderKind = ProviderKind.OPENAI_COMPATIBLE,
        baseUrl: String = "",
    ): PromptTemplate {
        if (providerKind == ProviderKind.MISTRAL_FIM) return PromptTemplate.CODESTRAL_API
        if (baseUrl.isNotBlank() && (isDeepSeekBetaUrl(baseUrl) || isMistralUrl(baseUrl))) {
            return PromptTemplate.CODESTRAL_API
        }
        val m = model.trim().lowercase()
        if (m.isEmpty()) return PromptTemplate.CHAT
        return when {
            m.contains("codestral") || m.contains("mistral-code") || m.contains("devstral") ->
                PromptTemplate.CODESTRAL_API
            m.contains("deepseek") && (m.contains("coder") || m.contains("code")) ->
                PromptTemplate.DEEPSEEK
            m.contains("qwen3-coder") || m.contains("qwen") ->
                PromptTemplate.QWEN
            m.contains("codegemma") || m.contains("codegeex") ->
                PromptTemplate.QWEN
            m.contains("codellama") || m.contains("code-llama") ->
                PromptTemplate.CODELLAMA
            m.contains("starcoder") || m.contains("santacoder") || m.contains("crystalcoder") ->
                PromptTemplate.STARCODER
            m.contains("gpt-") ||
                m.contains("claude") ||
                OPENAI_REASONING_REGEX.containsMatchIn(m) ||
                m.contains("chatgpt") ->
                PromptTemplate.CHAT
            m.contains("coder") || m.contains("code-") || m.endsWith("-code") ->
                PromptTemplate.QWEN
            else -> PromptTemplate.CHAT
        }
    }

    fun resolve(
        stored: PromptTemplate,
        model: String,
        providerKind: ProviderKind,
        baseUrl: String = "",
    ): PromptTemplate = if (stored.isAuto()) detect(model, providerKind, baseUrl) else stored

    fun isRecognized(
        model: String,
        providerKind: ProviderKind = ProviderKind.OPENAI_COMPATIBLE,
        baseUrl: String = "",
    ): Boolean {
        if (model.isBlank()) return false
        val detected = detect(model, providerKind, baseUrl)
        // Unrecognized-ish: fell through to CHAT without chat-family keywords.
        if (detected != PromptTemplate.CHAT) return true
        val m = model.lowercase()
        return OPENAI_REASONING_REGEX.containsMatchIn(m) ||
            listOf("gpt-", "claude", "chatgpt", "instruct", "chat").any { m.contains(it) }
    }
}

enum class TemplateProbeStatus {
    SUCCESS,
    EMPTY,
    FAILED,
}

data class TemplateProbeResult(
    val template: PromptTemplate,
    val status: TemplateProbeStatus,
    val httpStatus: Int? = null,
    val latencyMs: Long = 0,
    val preview: String = "",
    val error: String = "",
    val resolvedPath: String = "",
    val resolvedUrl: String = "",
) {
    fun isUsable(): Boolean = status == TemplateProbeStatus.SUCCESS
}
