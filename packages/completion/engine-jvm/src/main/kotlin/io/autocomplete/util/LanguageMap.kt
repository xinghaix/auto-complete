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

    fun normalize(
        languageId: String?,
        path: String?,
    ): String {
        val raw = languageId?.trim()?.lowercase().orEmpty()
        if (raw.isNotEmpty() && raw != "text" && raw != "textmate" && raw != "plaintext" && raw != "plain text") {
            return when (raw) {
                "c++" -> "cpp"
                "c#" -> "csharp"
                "objective-c" -> "objectivec"
                "shell" -> "shellscript"
                else -> raw
            }
        }
        val ext = path?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return byExt[ext] ?: (raw.ifEmpty { "text" })
    }
}
