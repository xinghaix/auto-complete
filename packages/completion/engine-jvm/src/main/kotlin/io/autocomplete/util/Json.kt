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
            is Number, is Boolean -> v.toString()
            is Map<*, *> ->
                obj(
                    *v.entries.map { (k, value) -> k.toString() to value }.toTypedArray(),
                )
            is List<*> -> arr(v)
            else -> "\"${escape(v.toString())}\""
        }

    fun parseObject(text: String): Map<String, Any?> {
        // Minimal tolerant parser for our response shapes.
        return SimpleJsonParser(text).parseObject()
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

    fun parseObject(): Map<String, Any?> {
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
                    break
                }
                else -> break
            }
        }
        return out
    }

    private fun parseArray(): List<Any?> {
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
                    break
                }
                else -> break
            }
        }
        return out
    }

    private fun parseValue(): Any? {
        skipWs()
        return when (peek()) {
            '"' -> parseString()
            '{' -> parseObject()
            '[' -> parseArray()
            't' -> {
                i += 4
                true
            }
            'f' -> {
                i += 5
                false
            }
            'n' -> {
                i += 4
                null
            }
            else -> parseNumber()
        }
    }

    private fun parseString(): String {
        expect('"')
        val sb = StringBuilder()
        while (i < s.length) {
            val c = s[i++]
            when (c) {
                '"' -> return sb.toString()
                '\\' -> {
                    if (i >= s.length) break
                    when (val e = s[i++]) {
                        '"', '\\', '/' -> sb.append(e)
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            val hex = s.substring(i, minOf(i + 4, s.length))
                            i += hex.length
                            sb.append(hex.toIntOrNull(16)?.toChar() ?: '?')
                        }
                        else -> sb.append(e)
                    }
                }
                else -> sb.append(c)
            }
        }
        return sb.toString()
    }

    private fun parseNumber(): Number {
        val start = i
        while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++
        val raw = s.substring(start, i)
        return raw.toLongOrNull() ?: raw.toDoubleOrNull() ?: 0
    }

    private fun skipWs() {
        while (i < s.length && s[i].isWhitespace()) i++
    }

    private fun peek(): Char = if (i < s.length) s[i] else '\u0000'

    private fun expect(c: Char) {
        if (peek() != c) throw IllegalArgumentException("Expected $c at $i")
        i++
    }
}
