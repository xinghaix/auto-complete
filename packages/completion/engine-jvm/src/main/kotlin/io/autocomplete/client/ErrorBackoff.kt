package io.autocomplete.client

/**
 * Circuit breaker / exponential backoff for completion errors.
 */
enum class ErrorKind {
    FATAL,
    RETRIABLE,
    TRANSIENT,
    CANCEL,
}

class ErrorBackoff(
    private val baseDelayMs: Long = 2_000,
    private val maxDelayMs: Long = 120_000,
    private val circuitThreshold: Int = 5,
    private val circuitCooldownMs: Long = 300_000,
    private val fatalProbeIntervalMs: Long = 300_000,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private var fatal: Boolean = false
    private var fatalStatus: Int? = null
    private var fatalAt: Long = 0
    private var opened: Long = 0
    private var failures: Int = 0
    private var blockedUntil: Long = 0

    fun success() {
        fatal = false
        fatalStatus = null
        fatalAt = 0
        opened = 0
        failures = 0
        blockedUntil = 0
    }

    fun reset() = success()

    fun failure(
        error: Throwable?,
        status: Int? = extractStatus(error),
    ): ErrorKind {
        val kind = classify(status, error)
        when (kind) {
            ErrorKind.FATAL -> {
                fatal = true
                fatalStatus = status
                fatalAt = clock()
            }
            ErrorKind.RETRIABLE -> {
                failures++
                val exp = (baseDelayMs * (1L shl (failures - 1).coerceAtMost(16)))
                val delay = exp.coerceAtMost(maxDelayMs)
                blockedUntil = clock() + delay
                if (failures >= circuitThreshold && opened == 0L) {
                    opened = clock()
                }
            }
            ErrorKind.CANCEL, ErrorKind.TRANSIENT -> Unit
        }
        return kind
    }

    fun blocked(): Boolean {
        if (fatal) return true
        val now = clock()
        if (opened > 0) {
            if (now - opened < circuitCooldownMs) return true
            opened = 0
            failures = 0
            blockedUntil = 0
            return false
        }
        if (blockedUntil > 0 && now < blockedUntil) return true
        return false
    }

    fun getFatalStatus(): Int? = if (fatal) fatalStatus else null

    fun shouldProbe(): Boolean {
        if (!fatal) return false
        val now = clock()
        if (now - fatalAt < fatalProbeIntervalMs) return false
        fatalAt = now
        return true
    }

    companion object {
        fun extractStatus(error: Throwable?): Int? {
            if (error == null) return null
            if (error is HttpStatusException) return error.status
            val msg = error.message.orEmpty()
            val match = Regex(""":\s*([45]\d{2})\b""").find(msg)
            return match?.groupValues?.getOrNull(1)?.toIntOrNull()
        }

        fun classify(
            status: Int?,
            error: Throwable? = null,
        ): ErrorKind {
            if (error is CancellationStyle) return ErrorKind.CANCEL
            if (error?.message?.contains("cancel", ignoreCase = true) == true) return ErrorKind.CANCEL
            val code = status ?: extractStatus(error)
            return when (code) {
                401, 402, 403 -> ErrorKind.FATAL
                429 -> ErrorKind.RETRIABLE
                in 500..599 -> ErrorKind.RETRIABLE
                null -> ErrorKind.TRANSIENT
                else -> ErrorKind.TRANSIENT
            }
        }
    }
}

/** Marker for cancel-like failures. */
interface CancellationStyle

class HttpStatusException(
    val status: Int,
    message: String,
) : RuntimeException(message)
