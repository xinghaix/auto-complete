package io.autocomplete.ui

import io.autocomplete.prompt.PromptTemplate
import org.junit.Assert.assertEquals
import org.junit.Test

class RequestPathStateTest {
    @Test
    fun switchingTemplatesPreservesIndependentPaths() {
        val state = RequestPathState()
        assertEquals("/chat", state.reset("/fim", "/completions", "/chat", PromptTemplate.CHAT))

        assertEquals("/fim", state.switchTo(PromptTemplate.CODESTRAL_API, "/custom-chat"))
        assertEquals("/custom-chat", state.chatPath())

        assertEquals("/completions", state.switchTo(PromptTemplate.QWEN, "/custom-fim"))
        assertEquals("/custom-fim", state.fimPath())

        assertEquals("/custom-chat", state.switchTo(PromptTemplate.CHAT, "/custom-completions"))
        assertEquals("/custom-completions", state.completionsPath())
        assertEquals("/custom-chat", state.chatPath())
    }
}
