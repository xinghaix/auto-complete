package io.autocomplete.util

import java.nio.file.FileSystems
import java.nio.file.Path
import java.nio.file.PathMatcher

class IgnoreRules(
    globs: List<String>,
    private val respectGitignore: Boolean = true,
    gitignorePatterns: List<String> = emptyList(),
) {
    private val matchers: List<PathMatcher> =
        (globs + if (respectGitignore) gitignorePatterns else emptyList())
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { glob ->
                val normalized =
                    when {
                        glob.startsWith("glob:") -> glob
                        else -> "glob:$glob"
                    }
                FileSystems.getDefault().getPathMatcher(normalized)
            }

    fun isIgnored(
        path: String,
        relativePath: String? = null,
    ): Boolean {
        val candidates =
            listOfNotNull(
                path,
                relativePath,
                path.replace('\\', '/'),
                relativePath?.replace('\\', '/'),
            ).distinct()
        for (candidate in candidates) {
            val p = Path.of(candidate)
            if (matchers.any { runCatching { it.matches(p) }.getOrDefault(false) }) return true
            val name = p.fileName?.toString().orEmpty()
            if (name == "node_modules" || name == ".git") return true
        }
        // cheap path segment checks for common noise
        val slash = path.replace('\\', '/')
        if ("/node_modules/" in slash || slash.endsWith("/node_modules")) return true
        if ("/.git/" in slash || slash.endsWith("/.git")) return true
        return false
    }

    companion object {
        val DEFAULT_GLOBS =
            listOf(
                "**/.git/**",
                "**/node_modules/**",
                "**/dist/**",
                "**/build/**",
                "**/target/**",
                "**/.idea/**",
                "**/.gradle/**",
                "**/vendor/**",
            )

        fun parseGitignore(text: String): List<String> =
            text.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") && !it.startsWith("!") }
                .map { line ->
                    when {
                        line.startsWith("/") -> "**$line"
                        line.contains('/') -> "**/$line"
                        else -> "**/$line"
                    }
                }.toList()
    }
}
