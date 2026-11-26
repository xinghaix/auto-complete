package io.autocomplete.engine

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
        minMs: Long = MIN_MS,
        maxMs: Long = MAX_MS,
    ): Long {
        val lo = minMs.coerceAtLeast(0L)
        val hi = maxOf(lo, maxMs.coerceAtLeast(0L))
        if (latencySamples.size < SAMPLE_SIZE) return current.coerceIn(lo, hi)
        val avg = latencySamples.takeLast(SAMPLE_SIZE).average().toLong()
        return avg.coerceIn(lo, hi)
    }
}
