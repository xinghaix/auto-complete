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

    private val SINGLE_CHAR_SUFFIX_CLOSERS = setOf(')', ']', '}', ';', ',', '"', '\'', '`', '>')

    fun postprocess(
        raw: String,
        prefix: String,
        suffix: String,
        firstLineOnly: Boolean,
    ): String? {
        var text = raw.replace("\r\n", "\n").replace('\r', '\n')
        text = stripPromptArtifacts(text)
        text = stripCodeFences(text)
        text = text.trimEnd()
        if (text.isEmpty()) return null
        if (firstLineOnly) {
            val firstNonWs = text.indexOfFirst { !it.isWhitespace() }
            if (firstNonWs < 0) return null
            val nlAfter = text.indexOf('\n', startIndex = firstNonWs)
            if (nlAfter >= 0) {
                text = text.substring(0, nlAfter)
            }
            text = text.trimEnd()
            if (text.isEmpty()) return null
        }
        // Remove overlap with already typed prefix tail
        text = removePrefixOverlap(text, prefix)
        if (text.isEmpty()) return null
        // Remove trailing overlap with the start of suffix's first line
        text = removeSuffixOverlap(text, suffix)
        if (text.isEmpty()) return null
        if (isUseless(Params(text, prefix, suffix))) return null
        return text
    }

    fun isUseless(params: Params): Boolean {
        val trimmed = params.suggestion.trim()
        if (trimmed.isEmpty()) return true
        // Avoid dropping valid short operator/digit continuations like "i +" -> "+" or "10" -> "0".
        if (isSubstantiveDuplicate(trimmed) && params.prefix.trimEnd().endsWith(trimmed)) return true
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
            val overlap = suggestion.substring(0, n)
            if (prefix.endsWith(overlap) && isSafePrefixOverlap(overlap, prefix, suggestion)) {
                return suggestion.substring(n)
            }
            n--
        }
        return suggestion
    }

    fun removeSuffixOverlap(
        suggestion: String,
        suffix: String,
    ): String {
        if (suggestion.isEmpty() || suffix.isEmpty()) return suggestion
        val suffixFirstLine = suffix.substringBefore('\n')
        if (suffixFirstLine.isEmpty()) return suggestion
        val lastLine = suggestion.substringAfterLast('\n')
        val max = minOf(lastLine.length, suffixFirstLine.length, 200)
        var n = max
        while (n > 0) {
            val overlap = suffixFirstLine.substring(0, n)
            if (suggestion.endsWith(overlap) && isSafeSuffixOverlap(suggestion, overlap)) {
                return suggestion.substring(0, suggestion.length - n)
            }
            n--
        }
        return suggestion
    }

    fun isMidLine(prefix: String): Boolean {
        val line = prefix.substringAfterLast('\n')
        return line.isNotEmpty() && line.any { !it.isWhitespace() }
    }

    fun shouldShowOnlyFirstLine(
        prefix: String,
        suggestion: String,
    ): Boolean {
        if (!suggestion.contains('\n')) return false
        return isMidLine(prefix)
    }

    internal fun stripPromptArtifacts(text: String): String {
        var t = text.replace("<|cursor|>", "")
        val trimmedStart = t.trimStart()
        if (trimmedStart.startsWith("Completion:\n")) {
            t = trimmedStart.removePrefix("Completion:\n")
        } else if (trimmedStart.startsWith("Completion: ")) {
            t = trimmedStart.removePrefix("Completion: ")
        }
        return t
    }

    internal fun stripCodeFences(text: String): String {
        val trimmedStart = text.trimStart()
        if (!trimmedStart.startsWith("```")) return text
        var t = trimmedStart.removePrefix("```")
        val nl = t.indexOf('\n')
        if (nl >= 0) {
            t = t.substring(nl + 1)
        } else {
            return ""
        }
        val trimmedEnd = t.trimEnd()
        if (trimmedEnd.endsWith("```")) {
            t = trimmedEnd.removeSuffix("```")
            if (t.endsWith("\n")) t = t.removeSuffix("\n")
        }
        return t
    }

    private fun isSubstantiveDuplicate(trimmed: String): Boolean {
        if (trimmed.length >= 3) return true
        return trimmed.all { it.isLetter() }
    }

    private fun isSafePrefixOverlap(
        overlap: String,
        prefix: String,
        suggestion: String,
    ): Boolean {
        if (overlap.length >= 3) return true
        // Never strip short (< 3 chars) punctuation, operator, or digit overlaps
        // (e.g. "==", "&&", "||", "++", "::", "100", "((").
        if (overlap.any { !it.isLetter() && !it.isWhitespace() }) return false
        if (overlap.length == 1 && overlap[0].isLetter()) {
            // Do not strip single-character letters inside identifiers (e.g. "clas"+"s", "buf"+"fer").
            val beforeIdx = prefix.length - 2
            val beforeChar = if (beforeIdx >= 0) prefix[beforeIdx] else null
            val afterChar = suggestion.getOrNull(1)
            val beforeWord = beforeChar != null && (beforeChar.isLetterOrDigit() || beforeChar == '_')
            val afterWord = afterChar != null && (afterChar.isLetterOrDigit() || afterChar == '_')
            if (beforeWord || afterWord) return false
        }
        return true
    }

    private fun isSafeSuffixOverlap(
        suggestion: String,
        overlap: String,
    ): Boolean {
        if (overlap.isBlank()) return false
        if (overlap.length == 1) {
            val ch = overlap[0]
            if (ch !in SINGLE_CHAR_SUFFIX_CLOSERS) return false
            return when (ch) {
                ')' -> countChar(suggestion, ')') > countChar(suggestion, '(')
                ']' -> countChar(suggestion, ']') > countChar(suggestion, '[')
                '}' -> countChar(suggestion, '}') > countChar(suggestion, '{')
                '"', '\'', '`' -> countChar(suggestion, ch) % 2 == 1
                else -> true
            }
        }
        val remaining = suggestion.substring(0, suggestion.length - overlap.length)
        // Avoid cutting 2-char letter tails inside words (e.g. "good" + "od_var").
        if (overlap.length < 3 && overlap.all { it.isLetterOrDigit() || it == '_' }) {
            val prev = remaining.lastOrNull()
            if (prev != null && (prev.isLetterOrDigit() || prev == '_')) return false
        }
        return true
    }

    private fun countChar(
        text: String,
        target: Char,
    ): Int {
        var count = 0
        for (c in text) if (c == target) count++
        return count
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
}
