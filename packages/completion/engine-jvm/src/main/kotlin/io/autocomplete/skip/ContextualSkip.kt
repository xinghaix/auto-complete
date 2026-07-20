package io.autocomplete.skip

/**
 * Contextual skip rules adapted from Kilo classic autocomplete behavior.
 */
object ContextualSkip {
    private val languageTerminators: Map<String, List<String>> =
        mapOf(
            "javascript" to listOf(";", "}", ")"),
            "javascriptreact" to listOf(";", "}", ")"),
            "typescript" to listOf(";", "}", ")"),
            "typescriptreact" to listOf(";", "}", ")"),
            "java" to listOf(";", "}", ")"),
            "kotlin" to listOf(";", "}", ")"),
            "scala" to listOf(";", "}", ")"),
            "c" to listOf(";", "}", ")"),
            "cpp" to listOf(";", "}", ")"),
            "csharp" to listOf(";", "}", ")"),
            "go" to listOf(";", "}", ")"),
            "rust" to listOf(";", "}", ")"),
            "php" to listOf(";", "}", ")"),
            "dart" to listOf(";", "}", ")"),
            "css" to listOf(";", "}", ")"),
            "scss" to listOf(";", "}", ")"),
            "less" to listOf(";", "}", ")"),
            "json" to listOf(";", "}", ")"),
            "jsonc" to listOf(";", "}", ")"),
            "python" to listOf(")", "]", "}"),
            "ruby" to listOf(")", "]", "}", "end"),
            "shellscript" to listOf(";", "fi", "done", "esac"),
            "bash" to listOf(";", "fi", "done", "esac"),
            "zsh" to listOf(";", "fi", "done", "esac"),
            "sh" to listOf(";", "fi", "done", "esac"),
            "sql" to listOf(";"),
            "mysql" to listOf(";"),
            "postgresql" to listOf(";"),
        )

    private val defaultTerminators = listOf(";", "}", ")")

    fun shouldSkip(
        prefix: String,
        suffix: String,
        languageId: String,
    ): Boolean {
        if (isMidWord(prefix, suffix)) return true
        if (endsWithTerminator(prefix, languageId)) return true
        return false
    }

    fun isMidWord(
        prefix: String,
        suffix: String,
    ): Boolean {
        if (prefix.isEmpty()) return false
        val before = prefix.last()
        val after = suffix.firstOrNull()
        val word = { c: Char -> c.isLetterOrDigit() || c == '_' }
        if (!word(before)) return false
        if (after != null && word(after)) return true
        // typing in the middle of an identifier-like token without whitespace break
        val line = prefix.substringAfterLast('\n')
        if (line.isEmpty()) return false
        val trailing = line.takeLastWhile { word(it) }
        return trailing.length >= 24
    }

    fun endsWithTerminator(
        prefix: String,
        languageId: String,
    ): Boolean {
        val trimmed = prefix.trimEnd()
        if (trimmed.isEmpty()) return false
        val terms = languageTerminators[languageId.lowercase()] ?: defaultTerminators
        return terms.any { term ->
            if (term.length == 1) {
                trimmed.endsWith(term)
            } else {
                val re = Regex("""(?:^|[\s;{}()])""" + Regex.escape(term) + """\s*$""")
                re.containsMatchIn(trimmed)
            }
        }
    }
}
