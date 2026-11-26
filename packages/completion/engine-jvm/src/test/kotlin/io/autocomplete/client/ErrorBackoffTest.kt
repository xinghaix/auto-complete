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

    @Test
    fun shouldProbeAllowsSingleProbePerFatalInterval() {
        var now = 10_000L
        val backoff = ErrorBackoff(fatalProbeIntervalMs = 5_000L, clock = { now })
        backoff.failure(HttpStatusException(401, "HTTP 401"))
        assertTrue(backoff.isFatal())
        assertFalse(backoff.shouldProbe())
        now += 5_000L
        assertTrue(backoff.shouldProbe())
        assertFalse(backoff.shouldProbe())
        backoff.success()
        assertFalse(backoff.isFatal())
        assertFalse(backoff.blocked())
    }

    @Test
    fun concurrentAccessIsThreadSafe() {
        val backoff = ErrorBackoff(baseDelayMs = 1, maxDelayMs = 10, circuitThreshold = 50, circuitCooldownMs = 5)
        val threads =
            (1..8).map { idx ->
                Thread {
                    repeat(200) { n ->
                        when ((idx + n) % 4) {
                            0 -> backoff.failure(HttpStatusException(429, "HTTP 429"))
                            1 -> backoff.blocked()
                            2 -> backoff.shouldProbe()
                            else -> backoff.reset()
                        }
                    }
                }
            }
        threads.forEach { it.start() }
        threads.forEach { it.join(5_000) }
        backoff.reset()
        assertFalse(backoff.blocked())
    }
}
