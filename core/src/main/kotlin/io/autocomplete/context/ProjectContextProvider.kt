package io.autocomplete.context

import java.util.concurrent.ConcurrentHashMap

/**
 * Runtime-only context isolated by the originating IDE project.
 */
class ProjectContextProvider {
    private data class ProjectContext(
        val recentSnippets: List<String> = emptyList(),
        val gitignorePatterns: List<String> = emptyList(),
    )

    private val contexts = ConcurrentHashMap<String, ProjectContext>()

    fun updateRecentSnippets(
        projectKey: String,
        snippets: List<String>,
    ) {
        if (projectKey.isBlank()) return
        contexts.compute(projectKey) { _, current ->
            (current ?: ProjectContext()).copy(recentSnippets = snippets.toList())
        }
    }

    fun updateGitignorePatterns(
        projectKey: String,
        patterns: List<String>,
    ) {
        if (projectKey.isBlank()) return
        contexts.compute(projectKey) { _, current ->
            (current ?: ProjectContext()).copy(gitignorePatterns = patterns.toList())
        }
    }

    fun recentSnippets(
        projectKey: String,
        enabled: Boolean,
        limit: Int,
        maxChars: Int,
    ): List<String> {
        if (!enabled || projectKey.isBlank()) return emptyList()
        return contexts[projectKey]
            ?.recentSnippets
            .orEmpty()
            .asSequence()
            .filter { it.isNotBlank() }
            .take(limit.coerceAtLeast(0))
            .map { it.take(maxChars.coerceAtLeast(0)) }
            .toList()
    }

    fun gitignorePatterns(projectKey: String): List<String> {
        if (projectKey.isBlank()) return emptyList()
        return contexts[projectKey]?.gitignorePatterns.orEmpty()
    }

    fun clear(projectKey: String) {
        if (projectKey.isNotBlank()) contexts.remove(projectKey)
    }
}
