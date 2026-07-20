package io.autocomplete.prompt

/**
 * Heuristic context / prompt budgets derived from model ids.
 *
 * OpenAI-compatible `/models` often omits context length; when it is present
 * we prefer that value. Otherwise fall back to name-based estimates.
 *
 * These budgets are **character** limits for local prompt packing, not exact
 * tokenizer counts — intentionally conservative for inline completion.
 */
object ModelLimits {
    data class Budget(
        /** Approx model context window in tokens (estimate or reported). */
        val contextTokens: Int,
        val maxPrefixChars: Int,
        val maxSuffixChars: Int,
        /** `reported` from API metadata, or `heuristic` from model name. */
        val source: String,
    )

    fun forModel(
        model: String,
        reportedContextTokens: Int? = null,
    ): Budget {
        val tokens =
            reportedContextTokens?.takeIf { it > 0 }
                ?: estimateContextTokens(model)
        val source = if (reportedContextTokens != null && reportedContextTokens > 0) "reported" else "heuristic"
        // Inline completion only needs a slice of the window; leave headroom for
        // response + special tokens. ~3 chars/token is a rough code average.
        val usableChars = (tokens * 3 * 0.40).toInt().coerceIn(2_000, 48_000)
        val prefix = usableChars.coerceIn(2_000, 32_000)
        val suffix = (prefix / 4).coerceIn(500, 8_000)
        return Budget(
            contextTokens = tokens,
            maxPrefixChars = prefix,
            maxSuffixChars = suffix,
            source = source,
        )
    }

    fun estimateContextTokens(model: String): Int {
        val m = model.trim().lowercase()
        if (m.isEmpty()) return 8_192
        // Explicit size tags win.
        extractSizeTag(m)?.let { return it }
        return when {
            m.contains("codestral") || m.contains("devstral") -> 32_768
            m.contains("qwen2.5") || m.contains("qwen3") || m.contains("qwen2") -> 32_768
            m.contains("qwen") -> 16_384
            m.contains("deepseek-coder") || m.contains("deepseek-r1") -> 16_384
            m.contains("deepseek") -> 16_384
            m.contains("starcoder2") -> 16_384
            m.contains("starcoder") || m.contains("santacoder") -> 8_192
            m.contains("codellama") || m.contains("code-llama") -> 16_384
            m.contains("codegemma") -> 8_192
            m.contains("gpt-4o") || m.contains("gpt-4.1") || m.contains("o1") || m.contains("o3") || m.contains("o4") ->
                128_000
            m.contains("gpt-4-turbo") || m.contains("gpt-4-1106") || m.contains("gpt-4-0125") -> 128_000
            m.contains("gpt-4") -> 8_192
            m.contains("gpt-3.5") -> 16_384
            m.contains("claude") -> 200_000
            m.contains("mistral-small") || m.contains("mistral-medium") || m.contains("mistral-large") -> 32_768
            m.contains("7b") || m.contains("8b") || m.contains("9b") -> 8_192
            m.contains("13b") || m.contains("14b") || m.contains("15b") -> 16_384
            m.contains("32b") || m.contains("34b") || m.contains("70b") || m.contains("72b") -> 32_768
            else -> 8_192
        }
    }

    /**
     * Pull optional context length fields from a `/models` JSON object item.
     */
    fun contextTokensFromModelObject(item: Map<*, *>): Int? {
        val directKeys =
            listOf(
                "context_length",
                "context_window",
                "max_model_len",
                "max_tokens",
                "max_seq_len",
                "n_ctx",
            )
        for (key in directKeys) {
            intFrom(item[key])?.takeIf { it >= 512 }?.let { return it }
        }
        val meta = item["meta"] as? Map<*, *>
        if (meta != null) {
            for (key in listOf("n_ctx_train", "context_length", "max_position_embeddings")) {
                intFrom(meta[key])?.takeIf { it >= 512 }?.let { return it }
            }
        }
        val top = item["data"] as? Map<*, *>
        if (top != null) {
            intFrom(top["context_length"])?.takeIf { it >= 512 }?.let { return it }
        }
        return null
    }

    private fun extractSizeTag(m: String): Int? {
        val patterns =
            listOf(
                Regex("""(?:^|[^0-9])(128)\s*k"""),
                Regex("""(?:^|[^0-9])(64)\s*k"""),
                Regex("""(?:^|[^0-9])(32)\s*k"""),
                Regex("""(?:^|[^0-9])(16)\s*k"""),
                Regex("""(?:^|[^0-9])(8)\s*k"""),
                Regex("""(?:^|[^0-9])(4)\s*k"""),
                Regex("""\b(128000|131072)\b"""),
                Regex("""\b(65536|64000)\b"""),
                Regex("""\b(32768|32000)\b"""),
                Regex("""\b(16384|16000)\b"""),
                Regex("""\b(8192|8000)\b"""),
                Regex("""\b(4096|4000)\b"""),
            )
        for (p in patterns) {
            val match = p.find(m) ?: continue
            val raw = match.groupValues.last()
            return when (raw) {
                "128" -> 128_000
                "64" -> 65_536
                "32" -> 32_768
                "16" -> 16_384
                "8" -> 8_192
                "4" -> 4_096
                else -> raw.toIntOrNull()
            }
        }
        return null
    }

    private fun intFrom(value: Any?): Int? =
        when (value) {
            is Number -> value.toInt()
            is String -> value.trim().toIntOrNull()
            else -> null
        }
}
