package io.autocomplete.skip

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ContextualSkipTest {
    @Test
    fun skipsMidWordWhenSurroundedByIdentifierChars() {
        assertTrue(ContextualSkip.isMidWord("val foo", "bar = 1"))
    }

    @Test
    fun doesNotSkipAtWordBoundary() {
        assertFalse(ContextualSkip.isMidWord("val foo ", "bar = 1"))
        assertFalse(ContextualSkip.isMidWord("val foo = ", ""))
    }

    @Test
    fun skipsTerminatorsForKotlin() {
        assertTrue(ContextualSkip.endsWithTerminator("val x = 1;", "kotlin"))
        assertTrue(ContextualSkip.endsWithTerminator("if (true) {}", "kotlin"))
    }

    @Test
    fun shouldSkipCombinesRules() {
        assertTrue(ContextualSkip.shouldSkip("val foo", "bar", "kotlin"))
        assertTrue(ContextualSkip.shouldSkip("val x = 1;", "", "kotlin"))
        assertFalse(ContextualSkip.shouldSkip("fun f() {\n    ", "", "kotlin"))
    }

    @Test
    fun endsWithTerminatorOnlyInspectsCurrentLine() {
        assertFalse(ContextualSkip.endsWithTerminator("const a = 1;\n", "typescript"))
        assertFalse(ContextualSkip.endsWithTerminator("const a = 1;\n    ", "typescript"))
        assertFalse(ContextualSkip.endsWithTerminator("if (ok) {}\n    ", "kotlin"))
        assertFalse(ContextualSkip.endsWithTerminator("foo(x)\n    ", "python"))
        assertFalse(ContextualSkip.shouldSkip("const a = 1;\n    ", "", "typescript"))
        assertTrue(ContextualSkip.endsWithTerminator("line1\nconst a = 1;  ", "typescript"))
    }
}
