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
        val line = prefix.substringAfterLast('\n')
        val lang = language.lowercase()
        if (isLineComment(line, lang)) return Result(inComment = true, inString = false)

        var inLineComment = false
        var inBlockComment = false
        var stringDelim: Char? = null
        var escape = false
        var i = 0
        while (i < prefix.length) {
            val c = prefix[i]
            val n = prefix.getOrNull(i + 1)
            if (inLineComment) {
                if (c == '\n') inLineComment = false
                i++
                continue
            }
            if (inBlockComment) {
                if (c == '*' && n == '/') {
                    inBlockComment = false
                    i += 2
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
                if (c == '\\') {
                    escape = true
                    i++
                    continue
                }
                if (c == stringDelim) stringDelim = null
                i++
                continue
            }
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
            if (c == '/' && n == '*' && supportsBlockComments(lang)) {
                inBlockComment = true
                i += 2
                continue
            }
            if (c == '"' || c == '\'' || c == '`') {
                stringDelim = c
                i++
                continue
            }
            i++
        }
        return Result(inComment = inLineComment || inBlockComment, inString = stringDelim != null)
    }

    private fun isLineComment(
        line: String,
        lang: String,
    ): Boolean {
        val t = line.trimStart()
        return when {
            supportsSlashComments(lang) && t.startsWith("//") -> true
            supportsHashComments(lang) && t.startsWith("#") -> true
            lang in setOf("python", "ruby") && t.startsWith("#") -> true
            else -> false
        }
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
            )

    private fun supportsHashComments(lang: String) =
        lang in setOf("python", "ruby", "shellscript", "bash", "zsh", "sh", "yaml", "toml")

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
                "css",
                "scss",
                "less",
            )
}
