package io.autocomplete.log

import java.time.Instant
import java.util.ArrayDeque
import java.util.concurrent.CopyOnWriteArrayList

enum class LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
    ;

    companion object {
        fun parse(value: String): LogLevel =
            runCatching { valueOf(value.trim().uppercase()) }.getOrDefault(INFO)
    }

    fun isEnabledBy(configured: String): Boolean = ordinal >= parse(configured).ordinal
}

data class LogEntry(
    val time: Instant = Instant.now(),
    val level: LogLevel,
    val requestId: String = "",
    val file: String = "",
    val trigger: String = "",
    val cacheHit: Boolean = false,
    val latencyMs: Long? = null,
    val status: Int? = null,
    val error: String = "",
    val prefixChars: Int? = null,
    val suffixChars: Int? = null,
    val operation: String = "",
    val method: String = "",
    val url: String = "",
    val model: String = "",
    val requestStyle: String = "",
    val responseChars: Int? = null,
    val message: String = "",
) {
    fun summary(): String {
        val ts = time.toString()
        val bits =
            buildList {
                add(level.name)
                if (requestId.isNotBlank()) add("id=$requestId")
                if (file.isNotBlank()) add(file.substringAfterLast('/'))
                if (trigger.isNotBlank()) add(trigger)
                if (operation.isNotBlank()) add("op=$operation")
                if (method.isNotBlank()) add(method)
                if (url.isNotBlank()) add(url)
                if (model.isNotBlank()) add("model=$model")
                if (requestStyle.isNotBlank()) add("style=$requestStyle")
                if (cacheHit) add("cache")
                latencyMs?.let { add("${it}ms") }
                status?.let { add("http=$it") }
                responseChars?.let { add("responseChars=$it") }
                if (error.isNotBlank()) add(error)
                if (message.isNotBlank()) add(message)
            }
        return "$ts " + bits.joinToString(" ")
    }
}

class LogBuffer(
    private var retention: Int = DEFAULT_RETENTION,
) {
    private val entries = ArrayDeque<LogEntry>()
    private val listeners = CopyOnWriteArrayList<(LogEntry) -> Unit>()

    @Synchronized
    fun setRetention(n: Int) {
        retention = n.coerceIn(MIN_RETENTION, MAX_RETENTION)
        trim()
    }

    @Synchronized
    fun retention(): Int = retention

    @Synchronized
    fun append(entry: LogEntry) {
        entries.addLast(entry)
        trim()
        listeners.forEach { runCatching { it(entry) } }
    }

    fun appendIfEnabled(
        entry: LogEntry,
        configuredLevel: String,
    ) {
        if (entry.level.isEnabledBy(configuredLevel)) append(entry)
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    @Synchronized
    fun snapshot(): List<LogEntry> = entries.toList()

    fun addListener(listener: (LogEntry) -> Unit) {
        listeners += listener
    }

    fun removeListener(listener: (LogEntry) -> Unit) {
        listeners -= listener
    }

    @Synchronized
    private fun trim() {
        // Ring buffer: drop oldest first when over the max line count.
        while (entries.size > retention) entries.removeFirst()
    }

    companion object {
        const val DEFAULT_RETENTION: Int = 1000
        const val MIN_RETENTION: Int = 50
        const val MAX_RETENTION: Int = 10_000
    }
}
