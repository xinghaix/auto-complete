package io.autocomplete.cache

import io.autocomplete.engine.CacheHit
import io.autocomplete.engine.CacheMatchType
import io.autocomplete.engine.CachedSuggestion

/**
 * Suggestion history cache with exact / partial-typing / bounded backspace matching and TTL.
 * Pure logic, no IDE dependencies.
 */
class SuggestionCache(
    private val capacity: Int = 20,
    private val ttlMs: Long = DEFAULT_TTL_MS,
    private val maxPrefixStoreChars: Int = DEFAULT_MAX_PREFIX_STORE_CHARS,
    private val maxSuffixStoreChars: Int = DEFAULT_MAX_SUFFIX_STORE_CHARS,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private data class Entry(
        val suggestion: CachedSuggestion,
        val storedAtMs: Long,
        val prefixTruncated: Boolean,
    )

    private val items = ArrayDeque<Entry>()

    @Synchronized
    fun clear() {
        items.clear()
    }

    @Synchronized
    fun put(suggestion: CachedSuggestion) {
        if (suggestion.text.isEmpty()) return
        val now = clock()
        pruneExpired(now)

        val prefixTruncated = suggestion.prefix.length > maxPrefixStoreChars
        val stored =
            CachedSuggestion(
                scope = suggestion.scope,
                prefix =
                    if (prefixTruncated) {
                        suggestion.prefix.takeLast(maxPrefixStoreChars)
                    } else {
                        suggestion.prefix
                    },
                suffix =
                    if (suggestion.suffix.length > maxSuffixStoreChars) {
                        suggestion.suffix.take(maxSuffixStoreChars)
                    } else {
                        suggestion.suffix
                    },
                text = suggestion.text,
            )

        val duplicate =
            items.any {
                it.suggestion.scope == stored.scope &&
                    it.suggestion.prefix == stored.prefix &&
                    it.suggestion.suffix == stored.suffix &&
                    it.suggestion.text == stored.text
            }
        if (duplicate) return
        items.addFirst(Entry(stored, now, prefixTruncated))
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
        val now = clock()
        pruneExpired(now)

        val normSuffix =
            if (suffix.length > maxSuffixStoreChars) {
                suffix.take(maxSuffixStoreChars)
            } else {
                suffix
            }
        val normPrefix =
            if (prefix.length > maxPrefixStoreChars) {
                prefix.takeLast(maxPrefixStoreChars)
            } else {
                prefix
            }

        for (entry in items) {
            val item = entry.suggestion
            if (item.scope != scope) continue
            if (normSuffix != item.suffix) continue

            if (normPrefix == item.prefix) {
                return CacheHit(item.text, CacheMatchType.EXACT, item)
            }

            if (item.text.isNotEmpty()) {
                val typed = extractTypedDelta(prefix, item.prefix, item.text.length, entry.prefixTruncated)
                if (typed != null && typed.isNotEmpty() && item.text.startsWith(typed)) {
                    val rest = item.text.substring(typed.length)
                    if (rest.isNotEmpty()) {
                        return CacheHit(rest, CacheMatchType.PARTIAL_TYPING, item)
                    }
                }
            }

            if (item.text.isNotEmpty()) {
                val deleted = extractDeletedDelta(prefix, normPrefix, item.prefix, entry.prefixTruncated)
                if (deleted != null &&
                    deleted.isNotEmpty() &&
                    deleted.length <= MAX_BACKWARD_DELETION_CHARS &&
                    !deleted.contains('\n') &&
                    (deleted + item.text).isNotEmpty()
                ) {
                    return CacheHit(deleted + item.text, CacheMatchType.BACKWARD_DELETION, item)
                }
            }
        }
        return null
    }

    @Synchronized
    fun size(): Int {
        pruneExpired(clock())
        return items.size
    }

    private fun extractTypedDelta(
        fullPrefix: String,
        storedPrefix: String,
        maxTyped: Int,
        prefixTruncated: Boolean,
    ): String? {
        if (!prefixTruncated) {
            return if (fullPrefix.startsWith(storedPrefix)) {
                fullPrefix.substring(storedPrefix.length)
            } else {
                null
            }
        }
        // Stored prefix was tail-truncated: look for storedPrefix right before the newly typed tail.
        val minStart = (fullPrefix.length - storedPrefix.length - maxTyped).coerceAtLeast(0)
        val maxStart = fullPrefix.length - storedPrefix.length
        if (maxStart < minStart) return null
        for (start in maxStart downTo minStart) {
            if (fullPrefix.regionMatches(start, storedPrefix, 0, storedPrefix.length)) {
                return fullPrefix.substring(start + storedPrefix.length)
            }
        }
        return null
    }

    private fun extractDeletedDelta(
        fullPrefix: String,
        normPrefix: String,
        storedPrefix: String,
        prefixTruncated: Boolean,
    ): String? {
        if (!prefixTruncated) {
            return if (storedPrefix.startsWith(fullPrefix)) {
                storedPrefix.substring(fullPrefix.length)
            } else {
                null
            }
        }
        // Tail-truncated: check if normPrefix's tail matches storedPrefix minus 1..MAX_BACKWARD_DELETION_CHARS chars.
        val maxDel = minOf(MAX_BACKWARD_DELETION_CHARS, storedPrefix.length - 1)
        for (del in 1..maxDel) {
            val remainingLen = storedPrefix.length - del
            if (remainingLen > 0 && normPrefix.endsWith(storedPrefix.substring(0, remainingLen))) {
                return storedPrefix.substring(remainingLen)
            }
        }
        return null
    }

    private fun pruneExpired(now: Long) {
        if (ttlMs <= 0L) return
        val iter = items.iterator()
        while (iter.hasNext()) {
            val e = iter.next()
            if (now - e.storedAtMs > ttlMs) {
                iter.remove()
            }
        }
    }

    companion object {
        const val DEFAULT_TTL_MS: Long = 5L * 60L * 1000L
        const val MAX_BACKWARD_DELETION_CHARS: Int = 32
        const val DEFAULT_MAX_PREFIX_STORE_CHARS: Int = 16_384
        const val DEFAULT_MAX_SUFFIX_STORE_CHARS: Int = 4_096
    }
}

/**
 * Optional prompt-hash LRU for full prompt results with TTL.
 */
class PromptLruCache(
    private val capacity: Int = 64,
    private val ttlMs: Long = SuggestionCache.DEFAULT_TTL_MS,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private data class Entry(
        val value: String,
        val storedAtMs: Long,
    )

    private val map = LinkedHashMap<String, Entry>(capacity.coerceAtLeast(1), 0.75f, true)

    @Synchronized
    fun get(key: String): String? {
        val entry = map[key] ?: return null
        if (ttlMs > 0L && clock() - entry.storedAtMs > ttlMs) {
            map.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(
        key: String,
        value: String,
    ) {
        if (value.isEmpty() || capacity <= 0) return
        map[key] = Entry(value, clock())
        while (map.size > capacity) {
            val first = map.entries.iterator().next()
            map.remove(first.key)
        }
    }

    @Synchronized
    fun clear() = map.clear()

    @Synchronized
    fun size(): Int {
        if (ttlMs > 0L) {
            val now = clock()
            val iter = map.entries.iterator()
            while (iter.hasNext()) {
                if (now - iter.next().value.storedAtMs > ttlMs) iter.remove()
            }
        }
        return map.size
    }
}
