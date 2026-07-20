package io.autocomplete.engine

import kotlin.math.max
import kotlin.math.min

/**
 * Adaptive debounce delay calculator.
 */
object Debouncer {
    const val MIN_MS = 150L
    const val INITIAL_MS = 300L
    const val MAX_MS = 1000L
    const val SAMPLE_SIZE = 10

    fun nextDelay(
        current: Long,
        latencySamples: List<Long>,
    ): Long {
        if (latencySamples.size < SAMPLE_SIZE) return current.coerceIn(MIN_MS, MAX_MS)
        val avg = latencySamples.takeLast(SAMPLE_SIZE).average().toLong()
        return max(MIN_MS, min(avg, MAX_MS))
    }
}
