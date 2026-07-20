package io.autocomplete.prompt

import io.autocomplete.client.ProviderKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PromptTemplateTest {
    @Test
    fun detectorMapsCommonModelFamilies() {
        assertEquals(PromptTemplate.QWEN, PromptTemplateDetector.detect("qwen2.5-coder:7b"))
        assertEquals(PromptTemplate.DEEPSEEK, PromptTemplateDetector.detect("deepseek-coder-v2"))
        assertEquals(PromptTemplate.STARCODER, PromptTemplateDetector.detect("starcoder2-15b"))
        assertEquals(PromptTemplate.CODESTRAL_API, PromptTemplateDetector.detect("codestral-latest"))
        assertEquals(PromptTemplate.CHAT, PromptTemplateDetector.detect("gpt-4o-mini"))
        assertEquals(
            PromptTemplate.CODESTRAL_API,
            PromptTemplateDetector.detect("anything", ProviderKind.MISTRAL_FIM),
        )
    }

    @Test
    fun autoResolvesFromModel() {
        val resolved =
            PromptTemplateDetector.resolve(
                PromptTemplate.AUTO,
                "qwen2.5-coder",
                ProviderKind.OPENAI_COMPATIBLE,
            )
        assertEquals(PromptTemplate.QWEN, resolved)
    }

    @Test
    fun tokenTemplatesWrapPrefixAndSuffix() {
        val prefix = "def f():\n    "
        val suffix = "\n"
        assertTrue(PromptTemplate.QWEN.formatTokenPrompt(prefix, suffix).contains("<|fim_prefix|>"))
        assertTrue(PromptTemplate.QWEN.formatTokenPrompt(prefix, suffix).contains(prefix))
        assertTrue(PromptTemplate.DEEPSEEK.formatTokenPrompt(prefix, suffix).contains("<｜fim▁begin｜>"))
        assertTrue(PromptTemplate.STARCODER.formatTokenPrompt(prefix, suffix).startsWith("<fim_prefix>"))
    }

    @Test
    fun recognitionAndLegacyMigration() {
        assertTrue(PromptTemplateDetector.isRecognized("qwen2.5-coder"))
        assertFalse(PromptTemplateDetector.isRecognized("my-mystery-model-xyz"))
        assertEquals(PromptTemplate.CODESTRAL_API, PromptTemplate.fromLegacyRequestStyle("FIM"))
        assertEquals(PromptTemplate.CHAT, PromptTemplate.fromLegacyRequestStyle("CHAT"))
        assertEquals(PromptTemplate.AUTO, PromptTemplate.fromStored("AUTO"))
    }

    @Test
    fun wireFormatsMatchExpectations() {
        assertEquals(WireFormat.FIM_FIELDS, PromptTemplate.CODESTRAL_API.wireFormat())
        assertEquals(WireFormat.COMPLETION_PROMPT, PromptTemplate.QWEN.wireFormat())
        assertEquals(WireFormat.CHAT_MESSAGES, PromptTemplate.CHAT.wireFormat())
    }
}
