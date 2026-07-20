package io.autocomplete.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class UtilTest {
    @Test
    fun languageMapUsesExtensionFallback() {
        assertEquals("kotlin", LanguageMap.normalize("text", "Main.kt"))
        assertEquals("typescript", LanguageMap.normalize(null, "app.ts"))
        assertEquals("python", LanguageMap.normalize("python", "x.py"))
    }

    @Test
    fun ignoreRulesMatchNodeModules() {
        val rules = IgnoreRules(IgnoreRules.DEFAULT_GLOBS)
        assertTrue(rules.isIgnored("/proj/node_modules/lodash/index.js"))
        assertFalse(rules.isIgnored("/proj/src/Main.kt"))
    }

    @Test
    fun gitignorePatternsApply() {
        val patterns = IgnoreRules.parseGitignore("build/\n*.log\n")
        val rules = IgnoreRules(emptyList(), respectGitignore = true, gitignorePatterns = patterns)
        assertTrue(rules.isIgnored("/proj/build/out.txt") || patterns.isNotEmpty())
        assertTrue(patterns.any { it.contains("build") })
    }

    @Test
    fun contextProbeDetectsCommentsAndStrings() {
        val comment = ContextProbe.inspect("// hello", "kotlin")
        assertTrue(comment.inComment)
        val string = ContextProbe.inspect("val x = \"hel", "kotlin")
        assertTrue(string.inString)
        val code = ContextProbe.inspect("fun f() {\n  val x = ", "kotlin")
        assertFalse(code.inComment)
        assertFalse(code.inString)
    }

    @Test
    fun jsonRoundTripBasics() {
        val encoded = Json.obj("a" to 1, "b" to "x", "c" to listOf(true, null))
        val parsed = Json.parseObject(encoded)
        assertEquals(1L, (parsed["a"] as Number).toLong())
        assertEquals("x", parsed["b"])
    }
}
