package io.autocomplete.util

/**
 * Lightweight comment/string detection for skip gates.
 * Heuristic only — intentionally cheap for the hot path.
 */
object ContextProbe {
    data class Result(
        val inComment: Boolean,
        val inString: Boolean,
    )

    fun inspect(
        prefix: String,
        language: String,
    ): Result {
        val lang = language.lowercase()

        var inLineComment = false
        var blockCommentEnd: String? = null
        var stringDelim: String? = null
        var stringMultiline = false
        var stringAllowsEscape = true
        var escape = false
        var i = 0
        val len = prefix.length

        while (i < len) {
            val c = prefix[i]
            val n = if (i + 1 < len) prefix[i + 1] else '\u0000'

            if (inLineComment) {
                if (c == '\n') inLineComment = false
                i++
                continue
            }

            if (blockCommentEnd != null) {
                if (prefix.startsWith(blockCommentEnd, i)) {
                    i += blockCommentEnd.length
                    blockCommentEnd = null
                    continue
                }
                i++
                continue
            }

            if (stringDelim != null) {
                if (escape) {
                    escape = false
                    i++
                    continue
                }
                if (stringAllowsEscape && c == '\\') {
                    escape = true
                    i++
                    continue
                }
                if (!stringMultiline && c == '\n') {
                    stringDelim = null
                    escape = false
                    i++
                    continue
                }
                if (prefix.startsWith(stringDelim, i)) {
                    i += stringDelim.length
                    stringDelim = null
                    stringMultiline = false
                    stringAllowsEscape = true
                    continue
                }
                i++
                continue
            }

            // Line comments
            if (c == '/' && n == '/' && supportsSlashComments(lang)) {
                inLineComment = true
                i += 2
                continue
            }
            if (c == '#' && supportsHashComments(lang)) {
                inLineComment = true
                i++
                continue
            }
            if (c == '-' && n == '-' && supportsDashComments(lang)) {
                inLineComment = true
                i += 2
                continue
            }

            // Block comments
            if (c == '/' && n == '*' && supportsBlockComments(lang)) {
                blockCommentEnd = "*/"
                i += 2
                continue
            }
            if (c == '<' && supportsHtmlComments(lang) && prefix.startsWith("<!--", i)) {
                blockCommentEnd = "-->"
                i += 4
                continue
            }

            // Triple-quoted multiline strings (Python / Kotlin / Java / Scala / Swift / Dart)
            if (c == '"' && supportsTripleDoubleQuotes(lang) && prefix.startsWith("\"\"\"", i)) {
                stringDelim = "\"\"\""
                stringMultiline = true
                stringAllowsEscape = lang != "kotlin"
                i += 3
                continue
            }
            if (c == '\'' && supportsTripleSingleQuotes(lang) && prefix.startsWith("'''", i)) {
                stringDelim = "'''"
                stringMultiline = true
                stringAllowsEscape = true
                i += 3
                continue
            }

            // Backtick template/raw strings
            if (c == '`' && supportsBacktickStrings(lang)) {
                stringDelim = "`"
                stringMultiline = true
                stringAllowsEscape = lang != "go"
                i++
                continue
            }

            // Double-quoted strings
            if (c == '"' && supportsDoubleQuotes(lang)) {
                stringDelim = "\""
                stringMultiline = false
                stringAllowsEscape = true
                i++
                continue
            }

            // Single-quoted strings / Rust lifetimes & char literals
            if (c == '\'' && supportsSingleQuotes(lang)) {
                if (lang == "rust") {
                    val consumed = consumeRustSingleQuote(prefix, i)
                    if (consumed > 0) {
                        i += consumed
                        continue
                    }
                    // Unclosed char literal on current line
                    stringDelim = "'"
                    stringMultiline = false
                    stringAllowsEscape = true
                    i++
                    continue
                }
                stringDelim = "'"
                stringMultiline = false
                stringAllowsEscape = true
                i++
                continue
            }

            i++
        }

        return Result(
            inComment = inLineComment || blockCommentEnd != null,
            inString = stringDelim != null,
        )
    }

    /**
     * Handles Rust `'lifetime` / `'static` / `'_` and closed char literals like `'a'`, `'\n'`, `'\''`.
     * Returns number of chars consumed if handled without entering an unclosed string, or 0 if unclosed char literal.
     */
    private fun consumeRustSingleQuote(
        prefix: String,
        start: Int,
    ): Int {
        val len = prefix.length
        val next = if (start + 1 < len) prefix[start + 1] else return 0
        if (next == '\\') {
            // Escaped char literal like '\n', '\'', '\u{...}'; find closing quote on the same line.
            var j = start + 2
            if (j < len) j++ // skip escaped char
            while (j < len && prefix[j] != '\n') {
                if (prefix[j] == '\'') return j - start + 1
                j++
            }
            return 0
        }
        if (start + 2 < len && prefix[start + 2] == '\'') {
            // Standard char literal 'x'
            return 3
        }
        if (next.isLetter() || next == '_') {
            // Rust lifetime or loop label: 'a, 'static, '_
            var j = start + 2
            while (j < len && (prefix[j].isLetterOrDigit() || prefix[j] == '_')) {
                j++
            }
            return j - start
        }
        return 0
    }

    private fun supportsSlashComments(lang: String) =
        lang in
            setOf(
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact",
                "java",
                "kotlin",
                "scala",
                "go",
                "rust",
                "c",
                "cpp",
                "csharp",
                "php",
                "swift",
                "dart",
                "scss",
                "less",
                "jsonc",
            )

    private fun supportsHashComments(lang: String) =
        lang in setOf("python", "ruby", "shellscript", "bash", "zsh", "sh", "yaml", "toml", "r", "perl")

    private fun supportsDashComments(lang: String) =
        lang in setOf("sql", "mysql", "postgresql", "lua", "haskell")

    private fun supportsBlockComments(lang: String) =
        lang in
            setOf(
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact",
                "java",
                "kotlin",
                "scala",
                "go",
                "rust",
                "c",
                "cpp",
                "csharp",
                "php",
                "swift",
                "dart",
                "css",
                "scss",
                "less",
                "sql",
                "mysql",
                "postgresql",
                "jsonc",
            )

    private fun supportsHtmlComments(lang: String) =
        lang in setOf("html", "xml", "vue", "svelte", "markdown")

    private fun supportsTripleDoubleQuotes(lang: String) =
        lang in setOf("python", "kotlin", "java", "scala", "swift", "dart", "groovy")

    private fun supportsTripleSingleQuotes(lang: String) =
        lang in setOf("python", "dart")

    private fun supportsBacktickStrings(lang: String) =
        lang in
            setOf(
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact",
                "go",
                "shellscript",
                "bash",
                "zsh",
                "sh",
                "php",
            )

    private fun supportsDoubleQuotes(lang: String) =
        lang !in setOf("markdown", "text", "plaintext", "plain_text", "plain text")

    private fun supportsSingleQuotes(lang: String) =
        lang !in setOf("markdown", "text", "plaintext", "plain_text", "plain text", "html", "xml")
}
