package io.autocomplete.log

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LogBufferTest {
    @Test
    fun configuredLevelFiltersLowerPriorityEntries() {
        val logs = LogBuffer()

        logs.appendIfEnabled(LogEntry(level = LogLevel.DEBUG, message = "debug"), "info")
        logs.appendIfEnabled(LogEntry(level = LogLevel.INFO, message = "info"), "info")
        logs.appendIfEnabled(LogEntry(level = LogLevel.WARN, message = "warn"), "info")
        logs.appendIfEnabled(LogEntry(level = LogLevel.ERROR, message = "error"), "info")

        assertEquals(listOf(LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR), logs.snapshot().map { it.level })
    }

    @Test
    fun ringBufferDropsOldestWhenOverMaxLines() {
        // Use setRetention after construct; MIN_RETENTION is 50 for settings UI.
        val logs = LogBuffer()
        logs.setRetention(LogBuffer.MIN_RETENTION)
        repeat(LogBuffer.MIN_RETENTION + 5) { i ->
            logs.append(LogEntry(level = LogLevel.INFO, message = "m$i"))
        }
        val snap = logs.snapshot()
        assertEquals(LogBuffer.MIN_RETENTION, snap.size)
        assertEquals("m5", snap.first().message)
        assertEquals("m${LogBuffer.MIN_RETENTION + 4}", snap.last().message)
    }

    @Test
    fun summaryIncludesStructuredRequestDiagnostics() {
        val summary =
            LogEntry(
                level = LogLevel.INFO,
                operation = "list_models",
                method = "GET",
                url = "https://example.com/v1/models",
                model = "coder",
                requestStyle = "CHAT",
                status = 200,
                latencyMs = 42,
                responseChars = 128,
                message = "models=3",
            ).summary()

        assertTrue(summary.contains("op=list_models"))
        assertTrue(summary.contains("GET https://example.com/v1/models"))
        assertTrue(summary.contains("model=coder"))
        assertTrue(summary.contains("style=CHAT"))
        assertTrue(summary.contains("http=200"))
    }
}
