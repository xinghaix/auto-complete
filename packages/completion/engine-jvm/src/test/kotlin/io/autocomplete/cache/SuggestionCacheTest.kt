package io.autocomplete.cache

import io.autocomplete.engine.CacheMatchType
import io.autocomplete.engine.CachedSuggestion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class SuggestionCacheTest {
    @Test
    fun exactMatch() {
        val cache = SuggestionCache(10)
        cache.put(CachedSuggestion("a.kt", "fun f() {", "", " println()"))
        val hit = cache.find("a.kt", "fun f() {", "")
        assertEquals(CacheMatchType.EXACT, hit!!.match)
        assertEquals(" println()", hit.text)
    }

    @Test
    fun partialTyping() {
        val cache = SuggestionCache(10)
        cache.put(CachedSuggestion("a.kt", "fun f() {", "", " println()"))
        val hit = cache.find("a.kt", "fun f() { p", "")
        assertEquals(CacheMatchType.PARTIAL_TYPING, hit!!.match)
        assertEquals("rintln()", hit.text)
    }

    @Test
    fun backwardDeletion() {
        val cache = SuggestionCache(10)
        cache.put(CachedSuggestion("a.kt", "fun f() { pr", "", "intln()"))
        val hit = cache.find("a.kt", "fun f() { ", "")
        assertEquals(CacheMatchType.BACKWARD_DELETION, hit!!.match)
        assertEquals("println()", hit.text)
    }

    @Test
    fun capacityEvictsOldest() {
        val cache = SuggestionCache(2)
        cache.put(CachedSuggestion("a", "1", "", "a"))
        cache.put(CachedSuggestion("a", "2", "", "b"))
        cache.put(CachedSuggestion("a", "3", "", "c"))
        assertEquals(2, cache.size())
        assertNull(cache.find("a", "1", ""))
        assertEquals("c", cache.find("a", "3", "")!!.text)
    }

    @Test
    fun lruCache() {
        val lru = PromptLruCache(2)
        lru.put("k1", "v1")
        lru.put("k2", "v2")
        lru.get("k1")
        lru.put("k3", "v3")
        assertEquals("v1", lru.get("k1"))
        assertNull(lru.get("k2"))
        assertEquals("v3", lru.get("k3"))
    }

    @Test
    fun backwardDeletionCapsLengthAndRejectsNewlines() {
        val cache = SuggestionCache(10)
        val longDeleted = "x".repeat(40)
        cache.put(CachedSuggestion("a.kt", "base$longDeleted", "", "tail"))
        assertNull(cache.find("a.kt", "base", ""))

        cache.put(CachedSuggestion("a.kt", "line1\nline2", "", "tail"))
        assertNull(cache.find("a.kt", "line1", ""))

        // Within 32 chars and single line still matches
        val okDeleted = "y".repeat(32)
        cache.put(CachedSuggestion("a.kt", "ok$okDeleted", "", "end"))
        val hit = cache.find("a.kt", "ok", "")
        assertEquals(CacheMatchType.BACKWARD_DELETION, hit!!.match)
        assertEquals("${okDeleted}end", hit.text)
    }

    @Test
    fun entriesExpireAfterTtlAndCapStoredPrefixSuffix() {
        var now = 1_000_000L
        val cache =
            SuggestionCache(
                capacity = 10,
                ttlMs = 300_000L,
                maxPrefixStoreChars = 64,
                maxSuffixStoreChars = 32,
                clock = { now },
            )
        val hugePrefix = "a".repeat(200) + "target("
        val hugeSuffix = ")" + "b".repeat(200)
        cache.put(CachedSuggestion("a.kt", hugePrefix, hugeSuffix, "arg1"))

        val hit = cache.find("a.kt", hugePrefix, hugeSuffix)
        assertEquals("arg1", hit!!.text)
        assertEquals(64, hit.source.prefix.length)
        assertEquals(32, hit.source.suffix.length)

        // Partial typing still works with truncated stored prefix
        val partial = cache.find("a.kt", hugePrefix + "ar", hugeSuffix)
        assertEquals(CacheMatchType.PARTIAL_TYPING, partial!!.match)
        assertEquals("g1", partial.text)

        // Expire after 5-minute TTL
        now += 300_001L
        assertNull(cache.find("a.kt", hugePrefix, hugeSuffix))
        assertEquals(0, cache.size())
    }
}
