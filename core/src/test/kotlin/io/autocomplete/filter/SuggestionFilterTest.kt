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
}
