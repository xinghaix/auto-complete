package io.autocomplete.client

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ErrorBackoffTest {
    @Test
    fun fatalBlocksUntilReset() {
        val backoff = ErrorBackoff()
        assertEquals(ErrorKind.FATAL, backoff.failure(HttpStatusException(401, "SSE failed: 401 Unauthorized")))
        assertTrue(backoff.blocked())
        assertEquals(401, backoff.getFatalStatus())
        backoff.reset()
        assertFalse(backoff.blocked())
    }

    @Test
    fun retriableOpensCircuit() {
        var now = 1_000_000L
        val backoff =
            ErrorBackoff(
                baseDelayMs = 10,
                maxDelayMs = 100,
                circuitThreshold = 3,
                circuitCooldownMs = 1_000,
                clock = { now },
            )
        repeat(3) {
            assertEquals(ErrorKind.RETRIABLE, backoff.failure(HttpStatusException(429, "HTTP 429")))
        }
        assertTrue(backoff.blocked())
        now += 2_000
        assertFalse(backoff.blocked())
    }

    @Test
    fun cancelIsNotRetriable() {
        val backoff = ErrorBackoff()
        assertEquals(ErrorKind.CANCEL, backoff.failure(CancelledException()))
        assertFalse(backoff.blocked())
    }
}
