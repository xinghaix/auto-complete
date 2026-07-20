package io.autocomplete.filter

/**
 * Post-process completion text and drop useless / duplicate suggestions.
 */
object SuggestionFilter {
    data class Params(
        val suggestion: String,
        val prefix: String,
        val suffix: String,
    )

    fun postprocess(
        raw: String,
        prefix: String,
        suffix: String,
        firstLineOnly: Boolean,
    ): String? {
        var text = raw.replace("\r\n", "\n").replace('\r', '\n')
        text = stripCodeFences(text)
        text = text.trimEnd()
        if (text.isEmpty()) return null
        if (firstLineOnly) {
            text = text.lineSequence().firstOrNull().orEmpty()
        }
        // Remove overlap with already typed prefix tail
        text = removePrefixOverlap(text, prefix)
        if (text.isEmpty()) return null
        if (isUseless(Params(text, prefix, suffix))) return null
        return text
    }

    fun isUseless(params: Params): Boolean {
        val trimmed = params.suggestion.trim()
        if (trimmed.isEmpty()) return true
        if (params.prefix.trimEnd().endsWith(trimmed)) return true
        if (params.suffix.trimStart().startsWith(trimmed)) return true
        if (duplicatesEdgeLines(params)) return true
        if (containsRepetitivePhrase(params.suggestion)) return true
        return false
    }

    fun removePrefixOverlap(
        suggestion: String,
        prefix: String,
    ): String {
        if (suggestion.isEmpty() || prefix.isEmpty()) return suggestion
        val max = minOf(suggestion.length, prefix.length, 200)
        var n = max
        while (n > 0) {
            if (prefix.endsWith(suggestion.substring(0, n))) {
                return suggestion.substring(n)
            }
            n--
        }
        return suggestion
    }

    fun shouldShowOnlyFirstLine(
        prefix: String,
        suggestion: String,
    ): Boolean {
        if (!suggestion.contains('\n')) return false
        val line = prefix.substringAfterLast('\n')
        // mid-line: current line already has non-whitespace content
        return line.isNotEmpty() && line.any { !it.isWhitespace() }
    }

    private fun duplicatesEdgeLines(params: Params): Boolean {
        val trimmed = params.suggestion.trim()
        if (!trimmed.contains('\n')) return false
        val lines = trimmed.split('\n')
        val first = lines.first().trim()
        val last = lines.last().trim()
        val prefixLast = params.prefix.trimEnd().substringAfterLast('\n').trim()
        val suffixFirst = params.suffix.trimStart().substringBefore('\n').trim()
        if (first.isNotEmpty() && prefixLast.isNotEmpty() && first == prefixLast) return true
        if (last.isNotEmpty() && suffixFirst.isNotEmpty() && last == suffixFirst) return true
        return false
    }

    private fun containsRepetitivePhrase(suggestion: String): Boolean {
        val phraseLength = 20
        val minRep = 3
        if (suggestion.length < phraseLength * minRep) return false
        // check both whole-string and trailing region
        val candidates = listOf(suggestion, suggestion.takeLast(phraseLength * minRep))
        for (region in candidates) {
            val phrase = region.takeLast(phraseLength)
            if (phrase.isBlank()) continue
            var count = 0
            var idx = 0
            while (true) {
                val found = region.indexOf(phrase, idx)
                if (found < 0) break
                count++
                idx = found + maxOf(1, phrase.length / 2)
                if (count >= minRep) return true
            }
        }
        return false
    }

    private fun stripCodeFences(text: String): String {
        var t = text.trim()
        if (t.startsWith("```")) {
            t = t.removePrefix("```")
            val nl = t.indexOf('\n')
            if (nl >= 0) t = t.substring(nl + 1)
            if (t.endsWith("```")) t = t.removeSuffix("```")
        }
        return t
    }
}
