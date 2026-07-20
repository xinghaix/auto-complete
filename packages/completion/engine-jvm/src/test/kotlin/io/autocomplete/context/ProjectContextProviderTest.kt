package io.autocomplete.context

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProjectContextProviderTest {
    @Test
    fun isolatesRecentSnippetsAndGitignoreByProject() {
        val provider = ProjectContextProvider()
        provider.updateRecentSnippets("project-a", listOf("File: /a/A.kt\nclass A"))
        provider.updateRecentSnippets("project-b", listOf("File: /b/B.kt\nclass B"))
        provider.updateGitignorePatterns("project-a", listOf("secret-a/**"))
        provider.updateGitignorePatterns("project-b", listOf("secret-b/**"))

        assertEquals(
            listOf("File: /a/A.kt\nclass A"),
            provider.recentSnippets("project-a", enabled = true, limit = 3, maxChars = 1200),
        )
        assertEquals(
            listOf("File: /b/B.kt\nclass B"),
            provider.recentSnippets("project-b", enabled = true, limit = 3, maxChars = 1200),
        )
        assertEquals(listOf("secret-a/**"), provider.gitignorePatterns("project-a"))
        assertEquals(listOf("secret-b/**"), provider.gitignorePatterns("project-b"))
    }

    @Test
    fun clearAllowsSameProjectKeyToBeRepopulated() {
        val provider = ProjectContextProvider()
        provider.updateRecentSnippets("project-a", listOf("old"))
        provider.updateGitignorePatterns("project-a", listOf("old/**"))

        provider.clear("project-a")

        assertTrue(provider.recentSnippets("project-a", true, 3, 1200).isEmpty())
        assertTrue(provider.gitignorePatterns("project-a").isEmpty())

        provider.updateRecentSnippets("project-a", listOf("new"))
        provider.updateGitignorePatterns("project-a", listOf("new/**"))
        assertEquals(listOf("new"), provider.recentSnippets("project-a", true, 3, 1200))
        assertEquals(listOf("new/**"), provider.gitignorePatterns("project-a"))
    }
}
