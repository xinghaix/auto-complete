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
        assertTrue(built.prefix.contains("// File: /tmp/Demo.kt"))
        assertTrue(built.prefix.contains("// Language: kotlin"))
        assertTrue(built.prefix.endsWith("x"))
    }

    @Test
    fun zeroOrNegativeBudgetReturnsEmptyPrefixAndSuffix() {
        val built =
            PromptBuilder.build(
                prefix = "non-empty-prefix",
                suffix = "non-empty-suffix",
                maxPrefixChars = 0,
                maxSuffixChars = -10,
                path = null,
                language = null,
                sendFilePath = false,
            )
        assertEquals("", built.prefix)
        assertEquals("", built.suffix)
    }

    @Test
    fun truncationDoesNotSplitUtf16SurrogatePairs() {
        val emoji = "\uD83D\uDE00" // 😀 (2 UTF-16 code units)
        val built =
            PromptBuilder.build(
                prefix = "a${emoji}b",
                suffix = "c${emoji}d",
                maxPrefixChars = 2,
                maxSuffixChars = 2,
                path = null,
                language = null,
                sendFilePath = false,
            )
        assertEquals("b", built.prefix)
        assertEquals("c", built.suffix)
        assertTrue(built.prefix.none { Character.isSurrogate(it) })
        assertTrue(built.suffix.none { Character.isSurrogate(it) })
    }

    @Test
    fun wrapsFimHeadersInTargetLanguageComments() {
        val py = PromptBuilder.build("pass", "", 100, 100, "app.py", "python", true)
        assertTrue(py.prefix.contains("# File: app.py"))
        assertTrue(py.prefix.contains("# Language: python"))

        val sql = PromptBuilder.build("SELECT 1", "", 100, 100, "q.sql", "sql", true)
        assertTrue(sql.prefix.contains("-- File: q.sql"))

        val html = PromptBuilder.build("<div/>", "", 100, 100, "index.html", "html", true)
        assertTrue(html.prefix.contains("<!-- File: index.html -->"))

        val css = PromptBuilder.build("body {}", "", 100, 100, "a.css", "css", true)
        assertTrue(css.prefix.contains("/* File: a.css */"))
    }

    @Test
    fun lruKeyIsSha256AndReflectsAllRequestParameters() {
        val k1 =
            PromptBuilder.lruKey(
                language = "kotlin",
                model = "qwen",
                prefix = "a",
                suffix = "b",
                promptTemplate = "QWEN",
                baseUrl = "http://127.0.0.1:11434/v1",
                temperature = 0.0,
                maxTokens = 128,
                firstLineOnlyWhenMidLine = true,
            )
        assertEquals(64, k1.length)
        assertTrue(k1.all { it in '0'..'9' || it in 'a'..'f' })
        assertTrue(k1 != PromptBuilder.lruKey("kotlin", "qwen", "a", "b", "CHAT", "http://127.0.0.1:11434/v1", 0.0, 128, true))
        assertTrue(k1 != PromptBuilder.lruKey("kotlin", "qwen", "a", "b", "QWEN", "http://127.0.0.1:8080/v1", 0.0, 128, true))
        assertTrue(k1 != PromptBuilder.lruKey("kotlin", "qwen", "a", "b", "QWEN", "http://127.0.0.1:11434/v1", 0.2, 128, true))
        assertTrue(k1 != PromptBuilder.lruKey("kotlin", "qwen", "a", "b", "QWEN", "http://127.0.0.1:11434/v1", 0.0, 64, true))
        assertTrue(k1 != PromptBuilder.lruKey("kotlin", "qwen", "a", "b", "QWEN", "http://127.0.0.1:11434/v1", 0.0, 128, false))
    }
}
