package io.autocomplete.cache

import io.autocomplete.engine.CacheHit
import io.autocomplete.engine.CacheMatchType
import io.autocomplete.engine.CachedSuggestion

/**
 * Suggestion history cache with exact / partial-typing / backspace matching.
 * Pure logic, no IDE dependencies.
 */
class SuggestionCache(
    private val capacity: Int = 20,
) {
    private val items = ArrayDeque<CachedSuggestion>()

    @Synchronized
    fun clear() {
        items.clear()
    }

    @Synchronized
    fun put(suggestion: CachedSuggestion) {
        if (suggestion.text.isEmpty()) return
        val duplicate =
            items.any {
                it.scope == suggestion.scope &&
                    it.prefix == suggestion.prefix &&
                    it.suffix == suggestion.suffix &&
                    it.text == suggestion.text
            }
        if (duplicate) return
        items.addFirst(suggestion)
        while (items.size > capacity.coerceAtLeast(1)) {
            items.removeLast()
        }
    }

    @Synchronized
    fun find(
        scope: String,
        prefix: String,
        suffix: String,
    ): CacheHit? {
        for (item in items) {
            if (item.scope != scope) continue
            if (prefix == item.prefix && suffix == item.suffix) {
                return CacheHit(item.text, CacheMatchType.EXACT, item)
            }
            if (item.text.isNotEmpty() && prefix.startsWith(item.prefix) && suffix == item.suffix) {
                val typed = prefix.substring(item.prefix.length)
                if (item.text.startsWith(typed)) {
                    val rest = item.text.substring(typed.length)
                    if (rest.isNotEmpty()) {
                        return CacheHit(rest, CacheMatchType.PARTIAL_TYPING, item)
                    }
                }
            }
            if (item.text.isNotEmpty() && item.prefix.startsWith(prefix) && suffix == item.suffix) {
                val deleted = item.prefix.substring(prefix.length)
                if (deleted.isNotEmpty() && (deleted + item.text).isNotEmpty()) {
                    return CacheHit(deleted + item.text, CacheMatchType.BACKWARD_DELETION, item)
                }
            }
        }
        return null
    }

    @Synchronized
    fun size(): Int = items.size
}

/**
 * Optional prefix-hash LRU for full prompt results.
 */
class PromptLruCache(
    private val capacity: Int = 64,
) {
    private val map = LinkedHashMap<String, String>(capacity, 0.75f, true)

    @Synchronized
    fun get(key: String): String? = map[key]

    @Synchronized
    fun put(
        key: String,
        value: String,
    ) {
        if (value.isEmpty() || capacity <= 0) return
        map[key] = value
        while (map.size > capacity) {
            val first = map.entries.iterator().next()
            map.remove(first.key)
        }
    }

    @Synchronized
    fun clear() = map.clear()

    @Synchronized
    fun size(): Int = map.size
}
