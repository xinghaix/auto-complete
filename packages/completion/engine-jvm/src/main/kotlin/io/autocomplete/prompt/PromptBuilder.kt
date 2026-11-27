package io.autocomplete.prompt

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

data class BuiltPrompt(
    val prefix: String,
    val suffix: String,
    val styleHint: String = "fim",
    val header: String = "",
)

object PromptBuilder {
    const val CURSOR_MARKER: String = "<|cursor|>"

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
        includeHeaderInPrefix: Boolean = true,
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
        val finalPrefix =
            if (!includeHeaderInPrefix || header.isEmpty()) {
                prunedPrefix
            } else {
                header + "\n" + prunedPrefix
            }
        return BuiltPrompt(
            prefix = finalPrefix,
            suffix = prunedSuffix,
            styleHint = if (includeHeaderInPrefix && wrapHeaderAsComment) "fim" else "chat",
            header = if (includeHeaderInPrefix) "" else header,
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

    const val STRICT_COMPLETION_INSTRUCTIONS: String =
        "Task: Inline code completion (Fill-In-the-Middle).\n" +
            "Rules:\n" +
            "1. Output ONLY the exact raw code to insert at <|cursor|> inside <code>.\n" +
            "2. Continue seamlessly from the exact characters immediately before <|cursor|>, staying syntactically valid in the immediate enclosing block (e.g. struct fields, function body, expression, SQL clause).\n" +
            "3. Never repeat characters already before or after <|cursor|>. Never copy unrelated lines from elsewhere in the file or <related_context>.\n" +
            "4. Never wrap output in markdown code fences, backticks, or quotes. Never add explanations, comments about placeholders, or conversational text.\n" +
            "5. Keep completions concise (usually the rest of the current line or small statement). If no completion makes sense, output nothing.\n\n" +
            "Example 1:\n" +
            "<code>def add(a, b):\n    <|cursor|>\n</code>\n" +
            "Completion:\n" +
            "return a + b\n\n" +
            "Example 2:\n" +
            "<code>type User struct {\n    Id   string `json:\"id\"`\n    Name <|cursor|>\n}</code>\n" +
            "Completion:\n" +
            "string `json:\"name\"`"

    fun chatUserContent(
        prefix: String,
        suffix: String,
        path: String? = null,
        language: String? = null,
        recentSnippets: List<String> = emptyList(),
        embedRules: Boolean = false,
    ): String =
        buildString {
            if (embedRules) {
                append(STRICT_COMPLETION_INSTRUCTIONS).append("\n\n")
            } else {
                append("Output ONLY the exact raw code to insert at ").append(CURSOR_MARKER).append(".\n")
            }
            if (!path.isNullOrBlank()) {
                append("File: ").append(path.trim()).append('\n')
            }
            if (!language.isNullOrBlank()) {
                append("Language: ").append(language.trim()).append('\n')
            }
            if (recentSnippets.isNotEmpty()) {
                append("<related_context>\n")
                recentSnippets.forEachIndexed { index, snippet ->
                    append("--- snippet ").append(index + 1).append(" ---\n")
                    append(snippet.trimEnd()).append('\n')
                }
                append("</related_context>\n")
            }
            append("<code>\n")
            append(prefix)
            append(CURSOR_MARKER)
            append(suffix)
            append("\n</code>\nCompletion:\n")
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
