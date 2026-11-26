package io.autocomplete.config

import io.autocomplete.prompt.PromptTemplate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class ProviderProfileTest {
    @Test
    fun uniqueNameAddsNumericSuffix() {
        val existing = listOf("New Profile", "New Profile 2", "mistral")
        assertEquals("New Profile 3", ProviderProfile.uniqueName("New Profile", existing))
        assertEquals("mistral 2", ProviderProfile.uniqueName("mistral", existing))
        assertEquals("ollama", ProviderProfile.uniqueName("ollama", existing))
    }

    @Test
    fun emptyProfileHasBlankConnection() {
        val p = ProviderProfile.empty("New Profile")
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

    @Test
    fun presetsSeedExpectedEndpointsAndTemplatesWithoutSecrets() {
        val ollama = ProviderProfile.fromPreset("ollama", "Ollama")
        assertEquals("http://127.0.0.1:11434/v1", ollama.baseUrl)
        assertEquals(PromptTemplate.AUTO.name, ollama.promptTemplate)

        val deepseek = ProviderProfile.fromPreset("deepseek-beta", "DeepSeek")
        assertEquals("https://api.deepseek.com/beta", deepseek.baseUrl)
        assertEquals(PromptTemplate.CODESTRAL_API.name, deepseek.promptTemplate)
        assertEquals("/completions", deepseek.fimPath)

        val mistral = ProviderProfile.fromPreset("mistral-codestral", "Mistral")
        assertEquals("https://codestral.mistral.ai/v1", mistral.baseUrl)
        assertEquals(PromptTemplate.CODESTRAL_API.name, mistral.promptTemplate)
        assertEquals("/fim/completions", mistral.fimPath)

        val vllm = ProviderProfile.fromPreset("vllm-lmstudio", "vLLM")
        assertEquals("http://127.0.0.1:8000/v1", vllm.baseUrl)
        assertEquals(PromptTemplate.AUTO.name, vllm.promptTemplate)
    }
}
