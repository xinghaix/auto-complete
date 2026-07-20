package io.autocomplete.ui

import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.prompt.WireFormat

internal class RequestPathState {
    private var currentWire: WireFormat = WireFormat.CHAT_MESSAGES
    private var fimPath: String = ""
    private var completionsPath: String = ""
    private var chatPath: String = ""

    fun reset(
        fimPath: String,
        completionsPath: String,
        chatPath: String,
        template: PromptTemplate,
    ): String {
        this.fimPath = fimPath
        this.completionsPath = completionsPath
        this.chatPath = chatPath
        currentWire = template.wireFormat()
        return current()
    }

    fun switchTo(
        template: PromptTemplate,
        currentText: String,
    ): String {
        capture(currentText)
        currentWire = template.wireFormat()
        return current()
    }

    fun capture(currentText: String) {
        when (currentWire) {
            WireFormat.FIM_FIELDS -> fimPath = currentText
            WireFormat.COMPLETION_PROMPT -> completionsPath = currentText
            WireFormat.CHAT_MESSAGES -> chatPath = currentText
        }
    }

    fun fimPath(): String = fimPath

    fun completionsPath(): String = completionsPath

    fun chatPath(): String = chatPath

    private fun current(): String =
        when (currentWire) {
            WireFormat.FIM_FIELDS -> fimPath
            WireFormat.COMPLETION_PROMPT -> completionsPath
            WireFormat.CHAT_MESSAGES -> chatPath
        }
}
