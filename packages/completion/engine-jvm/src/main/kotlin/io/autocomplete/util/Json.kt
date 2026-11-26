package io.autocomplete.util

object Json {
    fun obj(vararg pairs: Pair<String, Any?>): String =
        pairs.joinToString(prefix = "{", postfix = "}") { (k, v) ->
            "\"${escape(k)}\":${value(v)}"
        }

    fun arr(items: List<Any?>): String = items.joinToString(prefix = "[", postfix = "]") { value(it) }

    fun escape(text: String): String =
        buildString(text.length + 8) {
            for (c in text) {
                when (c) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\b' -> append("\\b")
                    '\u000C' -> append("\\f")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> if (c.code < 0x20) append("\\u%04x".format(c.code)) else append(c)
                }
            }
        }

    private fun value(v: Any?): String =
        when (v) {
            null -> "null"
            is Double ->
                if (v.isFinite()) {
                    v.toString()
                } else {
                    throw IllegalArgumentException("Non-finite JSON number: $v")
                }
            is Float ->
                if (v.isFinite()) {
                    v.toString()
                } else {
                    throw IllegalArgumentException("Non-finite JSON number: $v")
                }
            is Number, is Boolean -> v.toString()
            is Map<*, *> ->
                obj(
                    *v.entries.map { (k, value) -> k.toString() to value }.toTypedArray(),
                )
            is List<*> -> arr(v)
            else -> "\"${escape(v.toString())}\""
        }

    fun parseObject(text: String): Map<String, Any?> {
        return SimpleJsonParser(text).parseRootObject()
    }

    fun parseArray(text: String): List<Any?> {
        return SimpleJsonParser(text).parseRootArray()
    }

    fun stringAt(
        map: Map<String, Any?>,
        vararg path: String,
    ): String? {
        var cur: Any? = map
        for (p in path) {
            if (cur !is Map<*, *>) return null
            cur = cur[p]
        }
        return cur?.toString()
    }

    fun intAt(
        map: Map<String, Any?>,
        key: String,
    ): Int? = (map[key] as? Number)?.toInt() ?: map[key]?.toString()?.toIntOrNull()
}

private class SimpleJsonParser(
    private val s: String,
) {
    private var i = 0
    private var depth = 0

    fun parseRootObject(): Map<String, Any?> {
        val result = parseObject()
        skipWs()
        if (i != s.length) throw IllegalArgumentException("Unexpected trailing content at $i")
        return result
    }

    fun parseRootArray(): List<Any?> {
        skipWs()
        val result = parseArray()
        skipWs()
        if (i != s.length) throw IllegalArgumentException("Unexpected trailing content at $i")
        return result
    }

    fun parseObject(): Map<String, Any?> {
        enterContainer()
        try {
            skipWs()
            expect('{')
            val out = linkedMapOf<String, Any?>()
            skipWs()
            if (peek() == '}') {
                i++
                return out
            }
            while (true) {
                skipWs()
                val key = parseString()
                skipWs()
                expect(':')
                skipWs()
                out[key] = parseValue()
                skipWs()
                when (peek()) {
                    ',' -> {
                        i++
                        continue
                    }
                    '}' -> {
                        i++
                        return out
                    }
                    else -> throw IllegalArgumentException("Expected ',' or '}' at $i")
                }
            }
        } finally {
            depth--
        }
    }

    private fun parseArray(): List<Any?> {
        enterContainer()
        try {
            expect('[')
            val out = mutableListOf<Any?>()
            skipWs()
            if (peek() == ']') {
                i++
                return out
            }
            while (true) {
                skipWs()
                out += parseValue()
                skipWs()
                when (peek()) {
                    ',' -> {
                        i++
                        continue
                    }
                    ']' -> {
                        i++
                        return out
                    }
                    else -> throw IllegalArgumentException("Expected ',' or ']' at $i")
                }
            }
        } finally {
            depth--
        }
    }

    private fun parseValue(): Any? {
        skipWs()
        if (i >= s.length) throw IllegalArgumentException("Unexpected end of JSON at $i")
        return when (val c = s[i]) {
            '"' -> parseString()
            '{' -> parseObject()
            '[' -> parseArray()
            't' -> {
                expectLiteral("true")
                true
            }
            'f' -> {
                expectLiteral("false")
                false
            }
            'n' -> {
                expectLiteral("null")
                null
            }
            '-', in '0'..'9' -> parseNumber()
            else -> throw IllegalArgumentException("Unexpected token '$c' at $i")
        }
    }

    private fun parseString(): String {
        expect('"')
        val sb = StringBuilder()
        while (i < s.length) {
            val c = s[i++]
            when {
                c == '"' -> return sb.toString()
                c == '\\' -> {
                    if (i >= s.length) throw IllegalArgumentException("Unterminated escape sequence at $i")
                    when (val e = s[i++]) {
                        '"', '\\', '/' -> sb.append(e)
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            if (i + 4 > s.length) {
                                throw IllegalArgumentException("Incomplete unicode escape at $i")
                            }
                            val hex = s.substring(i, i + 4)
                            val code =
                                hex.toIntOrNull(16)
                                    ?: throw IllegalArgumentException("Invalid unicode escape '\\u$hex' at $i")
                            i += 4
                            sb.append(code.toChar())
                        }
                        else -> throw IllegalArgumentException("Invalid escape '\\$e' at ${i - 1}")
                    }
                }
                c.code < 0x20 -> throw IllegalArgumentException("Unescaped control character in string at ${i - 1}")
                else -> sb.append(c)
            }
        }
        throw IllegalArgumentException("Unterminated string literal")
    }

    private fun parseNumber(): Number {
        val start = i
        if (i < s.length && s[i] == '-') i++
        if (i >= s.length) throw IllegalArgumentException("Invalid number at $start")
        if (s[i] == '0') {
            i++
            if (i < s.length && s[i] in '0'..'9') {
                throw IllegalArgumentException("Leading zero in JSON number at $start")
            }
        } else if (s[i] in '1'..'9') {
            while (i < s.length && s[i] in '0'..'9') i++
        } else {
            throw IllegalArgumentException("Invalid number at $start")
        }
        var isFloat = false
        if (i < s.length && s[i] == '.') {
            isFloat = true
            i++
            if (i >= s.length || s[i] !in '0'..'9') {
                throw IllegalArgumentException("Invalid fraction in JSON number at $start")
            }
            while (i < s.length && s[i] in '0'..'9') i++
        }
        if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
            isFloat = true
            i++
            if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
            if (i >= s.length || s[i] !in '0'..'9') {
                throw IllegalArgumentException("Invalid exponent in JSON number at $start")
            }
            while (i < s.length && s[i] in '0'..'9') i++
        }
        val raw = s.substring(start, i)
        if (!isFloat) {
            raw.toLongOrNull()?.let { return it }
        }
        val d = raw.toDoubleOrNull() ?: throw IllegalArgumentException("Invalid JSON number '$raw' at $start")
        if (!d.isFinite()) throw IllegalArgumentException("Non-finite JSON number '$raw' at $start")
        return d
    }

    private fun expectLiteral(literal: String) {
        if (!s.regionMatches(i, literal, 0, literal.length)) {
            throw IllegalArgumentException("Expected '$literal' at $i")
        }
        i += literal.length
    }

    private fun enterContainer() {
        depth++
        if (depth > MAX_DEPTH) throw IllegalArgumentException("JSON nesting depth exceeded")
    }

    private fun skipWs() {
        while (i < s.length && s[i] in JSON_WHITESPACE) i++
    }

    private fun peek(): Char = if (i < s.length) s[i] else '\u0000'

    private fun expect(c: Char) {
        if (i >= s.length || s[i] != c) throw IllegalArgumentException("Expected '$c' at $i")
        i++
    }

    companion object {
        private const val MAX_DEPTH = 128
        private const val JSON_WHITESPACE = " \t\r\n"
    }
}
