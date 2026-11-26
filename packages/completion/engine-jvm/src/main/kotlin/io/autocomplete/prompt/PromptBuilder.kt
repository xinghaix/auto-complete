package io.autocomplete.prompt

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

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
        wrapHeaderAsComment: Boolean = true,
    ): BuiltPrompt {
        val prunedPrefix = takeEnd(prefix, maxPrefixChars)
        val prunedSuffix = takeStart(suffix, maxSuffixChars)
        val header =
            buildString {
                if (sendFilePath && !path.isNullOrBlank()) {
                    val line = "File: $path"
                    append(if (wrapHeaderAsComment) formatCommentLine(language, line) else line).append('\n')
                }
                if (!language.isNullOrBlank()) {
                    val line = "Language: $language"
                    append(if (wrapHeaderAsComment) formatCommentLine(language, line) else line).append('\n')
                }
                if (recentSnippets.isNotEmpty()) {
                    val heading = "Related snippets:"
                    append(if (wrapHeaderAsComment) formatCommentLine(language, heading) else heading).append('\n')
                    recentSnippets.forEachIndexed { index, snippet ->
                        val marker = "--- snippet ${index + 1} ---"
                        append(if (wrapHeaderAsComment) formatCommentLine(language, marker) else marker).append('\n')
                        append(snippet.trimEnd()).append('\n')
                    }
                }
            }
        val finalPrefix = if (header.isEmpty()) prunedPrefix else header + "\n" + prunedPrefix
        return BuiltPrompt(
            prefix = finalPrefix,
            suffix = prunedSuffix,
            styleHint = if (wrapHeaderAsComment) "fim" else "chat",
        )
    }

    fun formatCommentLine(
        language: String?,
        content: String,
    ): String {
        val lang = language?.trim()?.lowercase().orEmpty()
        return when (lang) {
            "python", "ruby", "shellscript", "bash", "zsh", "sh", "yaml", "toml", "r", "perl" ->
                "# $content"
            "sql", "mysql", "postgresql", "lua", "haskell" ->
                "-- $content"
            "html", "xml", "vue", "svelte", "markdown" ->
                "<!-- $content -->"
            "css", "scss", "less" ->
                "/* $content */"
            "", "text", "plaintext", "plain text", "plain_text", "json" ->
                content
            else ->
                "// $content"
        }
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
        promptTemplate: String = "",
        baseUrl: String = "",
        temperature: Double = 0.0,
        maxTokens: Int = 0,
        firstLineOnlyWhenMidLine: Boolean = true,
    ): String {
        val digest = MessageDigest.getInstance("SHA-256")
        fun updateField(value: String) {
            digest.update(value.toByteArray(StandardCharsets.UTF_8))
            digest.update(0.toByte())
        }
        updateField(language)
        updateField(model)
        updateField(promptTemplate)
        updateField(baseUrl)
        updateField(temperature.toString())
        updateField(maxTokens.toString())
        updateField(firstLineOnlyWhenMidLine.toString())
        updateField(prefix)
        updateField(suffix)
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun takeEnd(
        text: String,
        max: Int,
    ): String {
        if (max <= 0) return ""
        if (text.length <= max) return text
        var start = text.length - max
        if (start < text.length &&
            Character.isLowSurrogate(text[start]) &&
            start > 0 &&
            Character.isHighSurrogate(text[start - 1])
        ) {
            start++
        }
        return text.substring(start)
    }

    private fun takeStart(
        text: String,
        max: Int,
    ): String {
        if (max <= 0) return ""
        if (text.length <= max) return text
        var end = max
        if (end > 0 &&
            Character.isHighSurrogate(text[end - 1]) &&
            end < text.length &&
            Character.isLowSurrogate(text[end])
        ) {
            end--
        }
        return text.substring(0, end)
    }
}
