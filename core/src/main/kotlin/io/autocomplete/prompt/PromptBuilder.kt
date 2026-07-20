package io.autocomplete.prompt

data class BuiltPrompt(
    val prefix: String,
    val suffix: String,
    val styleHint: String = "fim",
)

object PromptBuilder {
    fun build(
        prefix: String,
        suffix: String,
        maxPrefixChars: Int,
        maxSuffixChars: Int,
        path: String?,
        language: String?,
        sendFilePath: Boolean,
        recentSnippets: List<String> = emptyList(),
    ): BuiltPrompt {
        val prunedPrefix = takeEnd(prefix, maxPrefixChars.coerceAtLeast(0))
        val prunedSuffix = takeStart(suffix, maxSuffixChars.coerceAtLeast(0))
        val header =
            buildString {
                if (sendFilePath && !path.isNullOrBlank()) {
                    append("File: ").append(path).append('\n')
                }
                if (!language.isNullOrBlank()) {
                    append("Language: ").append(language).append('\n')
                }
                if (recentSnippets.isNotEmpty()) {
                    append("Related snippets:\n")
                    recentSnippets.forEachIndexed { index, snippet ->
                        append("--- snippet ").append(index + 1).append(" ---\n")
                        append(snippet.trimEnd()).append('\n')
                    }
                }
            }
        val finalPrefix = if (header.isEmpty()) prunedPrefix else header + "\n" + prunedPrefix
        return BuiltPrompt(prefix = finalPrefix, suffix = prunedSuffix)
    }

    fun chatUserContent(
        prefix: String,
        suffix: String,
    ): String =
        buildString {
            append("Complete the code at the cursor. Output only the completion text.\n")
            append("<prefix>\n")
            append(prefix)
            append("\n</prefix>\n")
            append("<suffix>\n")
            append(suffix)
            append("\n</suffix>\n")
        }

    fun lruKey(
        language: String,
        model: String,
        prefix: String,
        suffix: String,
    ): String = "$language|$model|${prefix.hashCode()}|${suffix.hashCode()}|${prefix.length}|${suffix.length}"

    private fun takeEnd(
        text: String,
        max: Int,
    ): String {
        if (max <= 0 || text.length <= max) return text
        return text.substring(text.length - max)
    }

    private fun takeStart(
        text: String,
        max: Int,
    ): String {
        if (max <= 0 || text.length <= max) return text
        return text.substring(0, max)
    }
}
