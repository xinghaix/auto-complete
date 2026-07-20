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
}
