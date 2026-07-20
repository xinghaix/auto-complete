package io.autocomplete.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class ProviderProfileTest {
    @Test
    fun uniqueNameAddsNumericSuffix() {
        val existing = listOf("新配置", "新配置 2", "mistral")
        assertEquals("新配置 3", ProviderProfile.uniqueName("新配置", existing))
        assertEquals("mistral 2", ProviderProfile.uniqueName("mistral", existing))
        assertEquals("ollama", ProviderProfile.uniqueName("ollama", existing))
    }

    @Test
    fun emptyProfileHasBlankConnection() {
        val p = ProviderProfile.empty("新配置")
        assertEquals("", p.baseUrl)
        assertEquals("", p.model)
        assertEquals(true, p.isBlankConnection())
    }

    @Test
    fun credentialKeyIsProfileScoped() {
        val a = ProviderProfile(id = "aaa")
        val b = ProviderProfile(id = "bbb")
        assertEquals("apiKey:aaa", a.credentialKey())
        assertNotEquals(a.credentialKey(), b.credentialKey())
    }
}
