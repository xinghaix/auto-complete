package io.autocomplete.filter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SuggestionFilterTest {
    @Test
    fun dropsEmptyAndDuplicate() {
        assertNull(SuggestionFilter.postprocess("   ", "a", "b", false))
        assertNull(
            SuggestionFilter.postprocess(
                "foo",
                "println(foo",
                ")",
                false,
            ),
        )
    }

    @Test
    fun removesPrefixOverlap() {
        assertEquals("bar", SuggestionFilter.removePrefixOverlap("foobar", "foo"))
    }

    @Test
    fun firstLineOnlyWhenMidLine() {
        assertTrue(SuggestionFilter.shouldShowOnlyFirstLine("  val x = ", "1\n  val y = 2"))
        val out =
            SuggestionFilter.postprocess(
                "1\n  val y = 2",
                "  val x = ",
                "",
                firstLineOnly = true,
            )
        assertEquals("1", out)
    }

    @Test
    fun stripsCodeFences() {
        val out =
            SuggestionFilter.postprocess(
                "```kotlin\nprintln(1)\n```",
                "fun f() {\n",
                "\n}",
                firstLineOnly = false,
            )
        assertEquals("println(1)", out)
    }

    @Test
    fun detectsRepetitivePhrase() {
        val phrase = "we are going to start from the beginning. "
        val suggestion = phrase.repeat(4)
        assertTrue(
            SuggestionFilter.isUseless(
                SuggestionFilter.Params(suggestion, "prefix ", ""),
            ),
        )
    }

    @Test
    fun prefixOverlapDoesNotStripShortOperatorPunctuationOrDigitContinuations() {
        assertEquals("= 0)", SuggestionFilter.removePrefixOverlap("= 0)", "if (x ="))
        assertEquals("& b", SuggestionFilter.removePrefixOverlap("& b", "a &"))
        assertEquals("| b", SuggestionFilter.removePrefixOverlap("| b", "a |"))
        assertEquals("+", SuggestionFilter.removePrefixOverlap("+", "i +"))
        assertEquals(":string", SuggestionFilter.removePrefixOverlap(":string", "std:"))
        assertEquals("0", SuggestionFilter.removePrefixOverlap("0", "val x = 10"))
        assertEquals("(a, b))", SuggestionFilter.removePrefixOverlap("(a, b))", "foo("))
        assertEquals("((a))", SuggestionFilter.removePrefixOverlap("((a))", "foo(("))
        assertEquals("s Foo", SuggestionFilter.removePrefixOverlap("s Foo", "clas"))
        assertEquals("fer", SuggestionFilter.removePrefixOverlap("fer", "buf"))
        // End-to-end postprocess must also keep valid short continuations
        assertEquals("= 0)", SuggestionFilter.postprocess("= 0)", "if (x =", "", false))
        assertEquals("+", SuggestionFilter.postprocess("+", "i +", "", false))
        assertEquals("0", SuggestionFilter.postprocess("0", "val x = 10", "", false))
    }

    @Test
    fun plainCompletionsPreserveLeadingSpacesIndentationAndNewlines() {
        assertEquals(" 42", SuggestionFilter.postprocess(" 42", "const x =", "", false))
        assertEquals("    return a + b", SuggestionFilter.postprocess("    return a + b", "def add(a, b):\n", "", false))
        assertEquals(
            "\n    return a + b",
            SuggestionFilter.postprocess("\n    return a + b", "def add(a, b):", "", false),
        )
        assertEquals(
            "    return a + b",
            SuggestionFilter.postprocess("```python\n    return a + b\n```", "def add(a, b):\n", "", false),
        )
    }

    @Test
    fun removeSuffixOverlapTrimsTrailingSuffixWithoutBreakingBalancedCalls() {
        assertEquals("a, b", SuggestionFilter.removeSuffixOverlap("a, b)", ")"))
        assertEquals("return 1", SuggestionFilter.removeSuffixOverlap("return 1;", ";\n}"))
        assertEquals("a, b", SuggestionFilter.removeSuffixOverlap("a, b);", ");\n"))
        assertEquals("hello", SuggestionFilter.removeSuffixOverlap("hello world", " world\n"))
        assertEquals("hello", SuggestionFilter.removeSuffixOverlap("hello\"", "\");"))
        // Balanced inner parens MUST NOT be stripped
        assertEquals("bar(x)", SuggestionFilter.removeSuffixOverlap("bar(x)", ")"))
        // Surplus closing paren IS stripped
        assertEquals("bar(x)", SuggestionFilter.removeSuffixOverlap("bar(x))", ")"))
        // Single-char letter overlap with next identifier MUST NOT be stripped
        assertEquals("foo", SuggestionFilter.removeSuffixOverlap("foo", "open()"))
    }
}
