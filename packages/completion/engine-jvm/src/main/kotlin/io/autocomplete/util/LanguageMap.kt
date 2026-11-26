package io.autocomplete.util

object LanguageMap {
    private val byExt =
        mapOf(
            "ts" to "typescript",
            "tsx" to "typescriptreact",
            "js" to "javascript",
            "jsx" to "javascriptreact",
            "py" to "python",
            "java" to "java",
            "kt" to "kotlin",
            "kts" to "kotlin",
            "go" to "go",
            "rs" to "rust",
            "rb" to "ruby",
            "php" to "php",
            "cs" to "csharp",
            "cpp" to "cpp",
            "cc" to "cpp",
            "cxx" to "cpp",
            "c" to "c",
            "h" to "c",
            "hpp" to "cpp",
            "swift" to "swift",
            "scala" to "scala",
            "md" to "markdown",
            "json" to "json",
            "yml" to "yaml",
            "yaml" to "yaml",
            "sh" to "shellscript",
            "bash" to "shellscript",
            "zsh" to "shellscript",
            "sql" to "sql",
            "css" to "css",
            "scss" to "scss",
            "html" to "html",
            "xml" to "xml",
            "vue" to "vue",
            "svelte" to "svelte",
            "dart" to "dart",
        )

    private val aliases =
        mapOf(
            "c++" to "cpp",
            "c#" to "csharp",
            "objective-c" to "objectivec",
            "shell" to "shellscript",
            "shell script" to "shellscript",
            "typescript jsx" to "typescriptreact",
            "javascript jsx" to "javascriptreact",
            "ecmascript 6" to "javascript",
            "kotlin script" to "kotlin",
        )

    private val plaintextIds =
        setOf(
            "text",
            "textmate",
            "plaintext",
            "plain text",
            "plain_text",
        )

    fun normalize(
        languageId: String?,
        path: String?,
    ): String {
        val raw = languageId?.trim()?.lowercase().orEmpty()
        if (raw.isNotEmpty() && raw !in plaintextIds) {
            return aliases[raw] ?: raw
        }
        val ext = path?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return byExt[ext] ?: (raw.ifEmpty { "text" })
    }
}
