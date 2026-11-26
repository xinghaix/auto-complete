package io.autocomplete.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class UtilTest {
    @Test
    fun languageMapUsesExtensionFallbackAndAliases() {
        assertEquals("kotlin", LanguageMap.normalize("text", "Main.kt"))
        assertEquals("python", LanguageMap.normalize("PLAIN_TEXT", "script.py"))
        assertEquals("typescript", LanguageMap.normalize(null, "app.ts"))
        assertEquals("python", LanguageMap.normalize("python", "x.py"))
        assertEquals("shellscript", LanguageMap.normalize("Shell Script", "run.sh"))
        assertEquals("typescriptreact", LanguageMap.normalize("TypeScript JSX", "App.tsx"))
        assertEquals("javascriptreact", LanguageMap.normalize("JavaScript JSX", "App.jsx"))
    }

    @Test
    fun ignoreRulesMatchNodeModulesAndProtectMalformedInputs() {
        val rules = IgnoreRules(IgnoreRules.DEFAULT_GLOBS + listOf("[unclosed", "*.{broken"))
        assertTrue(rules.isIgnored("/proj/node_modules/lodash/index.js"))
        assertFalse(rules.isIgnored("/proj/src/Main.kt"))
        // Must never falsely ignore partial name matches
        assertFalse(rules.isIgnored("/proj/src/rebuild/app.ts"))
        assertFalse(rules.isIgnored("/proj/src/redist/a.ts"))
        assertFalse(rules.isIgnored("/proj/src/builder.ts"))
        // Must never crash on virtual paths or NUL bytes
        assertFalse(rules.isIgnored("jar:///a.jar!/com/example/Foo.class"))
        assertFalse(rules.isIgnored("virtual\u0000path"))
    }

    @Test
    fun gitignorePatternsSupportDirSlashRootAnchorAndNegation() {
        val patterns =
            IgnoreRules.parseGitignore(
                """
                # comment
                build/
                /root-only.txt
                *.log
                !important.log
                """.trimIndent(),
            )
        val rules = IgnoreRules(emptyList(), respectGitignore = true, gitignorePatterns = patterns)
        assertTrue(rules.isIgnored("/proj/build/out.txt"))
        assertTrue(rules.isIgnored("build/out.txt"))
        assertFalse(rules.isIgnored("/proj/src/rebuild/out.txt"))
        assertTrue(rules.isIgnored("/proj/debug.log"))
        assertFalse(rules.isIgnored("/proj/src/my.logger.ts"))
        assertFalse(rules.isIgnored("/proj/important.log"))
        assertTrue(rules.isIgnored("root-only.txt"))
        assertTrue(rules.isIgnored("/proj/root-only.txt", relativePath = "root-only.txt"))
        assertFalse(rules.isIgnored("sub/root-only.txt"))
        assertFalse(rules.isIgnored("/proj/sub/root-only.txt", relativePath = "sub/root-only.txt"))
    }

    @Test
    fun contextProbeHandlesMultilineStringsRustLifetimesSqlAndHtml() {
        val comment = ContextProbe.inspect("// hello", "kotlin")
        assertTrue(comment.inComment)
        assertFalse(comment.inString)

        val string = ContextProbe.inspect("val x = \"hel", "kotlin")
        assertTrue(string.inString)
        assertFalse(string.inComment)

        val code = ContextProbe.inspect("fun f() {\n  val x = ", "kotlin")
        assertFalse(code.inComment)
        assertFalse(code.inString)

        // Line starting with // inside JS template literal is a STRING, not a comment!
        val tpl = ContextProbe.inspect("const s = `line1\n// not a comment", "typescript")
        assertTrue(tpl.inString)
        assertFalse(tpl.inComment)

        // Single-line double quote resets on newline
        val resetAfterNewline = ContextProbe.inspect("val a = \"unclosed\nval b = ", "kotlin")
        assertFalse(resetAfterNewline.inString)

        // Rust lifetimes must NOT pollute string state
        val rustLifetime =
            ContextProbe.inspect("fn foo<'a>(x: &'a str) -> &'static str {\n    let y = ", "rust")
        assertFalse(rustLifetime.inString)
        assertFalse(rustLifetime.inComment)

        // Python triple quotes (""" and ''')
        val pyTriple = ContextProbe.inspect("doc = \"\"\"\n# not comment\nstill string", "python")
        assertTrue(pyTriple.inString)
        assertFalse(pyTriple.inComment)
        val pyClosed = ContextProbe.inspect("doc = '''\n# text\n'''\nx = ", "python")
        assertFalse(pyClosed.inString)
        assertFalse(pyClosed.inComment)

        // SQL -- comments
        val sqlComment = ContextProbe.inspect("SELECT 1 -- trailing", "sql")
        assertTrue(sqlComment.inComment)
        val sqlNextLine = ContextProbe.inspect("SELECT 1 -- trailing\nFROM t", "sql")
        assertFalse(sqlNextLine.inComment)

        // HTML <!-- --> comments
        val htmlOpen = ContextProbe.inspect("<div><!-- inside", "html")
        assertTrue(htmlOpen.inComment)
        val htmlClosed = ContextProbe.inspect("<div><!-- inside --><span>", "html")
        assertFalse(htmlClosed.inComment)
    }

    @Test
    fun jsonRoundTripAndStrictValidation() {
        val encoded = Json.obj("a" to 1, "b" to "x", "c" to listOf(true, null))
        val parsed = Json.parseObject(encoded)
        assertEquals(1L, (parsed["a"] as Number).toLong())
        assertEquals("x", parsed["b"])

        // Strict parser rejects malformed JSON instead of returning 0 or partial data
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": broken}""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": "unclosed""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": 1} trailing""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": tru}""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": 01}""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""{"a": 1.}""") }
        assertThrows(IllegalArgumentException::class.java) { Json.parseObject("""["not-an-object"]""") }
        assertThrows(IllegalArgumentException::class.java) { Json.obj("n" to Double.NaN) }
        assertThrows(IllegalArgumentException::class.java) { Json.obj("n" to Double.POSITIVE_INFINITY) }
    }
}
