package io.autocomplete.prompt

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PromptBuilderBudgetTest {
    @Test
    fun trimsPrefixAndSuffixToBudget() {
        val prefix = "a".repeat(100)
        val suffix = "b".repeat(100)
        val built =
            PromptBuilder.build(
                prefix = prefix,
                suffix = suffix,
                maxPrefixChars = 10,
                maxSuffixChars = 5,
                path = null,
                language = null,
                sendFilePath = false,
            )
        assertEquals(10, built.prefix.length)
        assertEquals(5, built.suffix.length)
        assertTrue(built.prefix.all { it == 'a' })
        assertTrue(built.suffix.all { it == 'b' })
    }

    @Test
    fun includesPathAndLanguageWhenEnabled() {
        val built =
            PromptBuilder.build(
                prefix = "x",
                suffix = "y",
                maxPrefixChars = 100,
                maxSuffixChars = 100,
                path = "/tmp/Demo.kt",
                language = "kotlin",
                sendFilePath = true,
            )
        assertTrue(built.prefix.contains("File: /tmp/Demo.kt"))
        assertTrue(built.prefix.contains("Language: kotlin"))
        assertTrue(built.prefix.endsWith("x"))
    }
}
