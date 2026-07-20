package io.autocomplete.prompt

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ModelLimitsTest {
    @Test
    fun estimatesCommonFamilies() {
        assertEquals(32_768, ModelLimits.estimateContextTokens("qwen2.5-coder:7b"))
        assertEquals(32_768, ModelLimits.estimateContextTokens("codestral-latest"))
        assertEquals(16_384, ModelLimits.estimateContextTokens("deepseek-coder-v2"))
        assertEquals(128_000, ModelLimits.estimateContextTokens("gpt-4o-mini"))
        assertEquals(32_768, ModelLimits.estimateContextTokens("my-model-32k"))
    }

    @Test
    fun budgetIsConservativeSliceOfContext() {
        val budget = ModelLimits.forModel("qwen2.5-coder")
        assertEquals(32_768, budget.contextTokens)
        assertTrue(budget.maxPrefixChars in 2_000..32_000)
        assertTrue(budget.maxSuffixChars in 500..8_000)
        assertTrue(budget.maxSuffixChars < budget.maxPrefixChars)
        assertEquals("heuristic", budget.source)
    }

    @Test
    fun prefersReportedContextLength() {
        val budget = ModelLimits.forModel("unknown-model", reportedContextTokens = 16_384)
        assertEquals(16_384, budget.contextTokens)
        assertEquals("reported", budget.source)
    }

    @Test
    fun parsesContextFieldsFromModelObject() {
        val item =
            mapOf(
                "id" to "demo",
                "context_length" to 8192,
            )
        assertEquals(8192, ModelLimits.contextTokensFromModelObject(item))
        val meta =
            mapOf(
                "id" to "demo2",
                "meta" to mapOf("n_ctx_train" to 32768),
            )
        assertEquals(32768, ModelLimits.contextTokensFromModelObject(meta))
    }
}
