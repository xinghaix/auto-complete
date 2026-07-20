package io.autocomplete.engine

data class ContextHints(
    val inComment: Boolean = false,
    val inString: Boolean = false,
)

data class CompletionRequest(
    val id: String,
    val path: String,
    val language: String,
    val prefix: String,
    val suffix: String,
    val offset: Int,
    val trigger: Trigger,
    val generation: Long,
    val fileSizeBytes: Long = 0,
    val context: ContextHints = ContextHints(),
    val projectKey: String = "",
)

enum class Trigger {
    AUTO,
    MANUAL,
}

data class Usage(
    val inputTokens: Int? = null,
    val outputTokens: Int? = null,
    val cost: Double? = null,
)

data class CompletionResponse(
    val id: String,
    val text: String,
    val latencyMs: Long,
    val cached: Boolean,
    val model: String,
    val usage: Usage? = null,
    val generation: Long = 0,
)

sealed class CompletionOutcome {
    data class Success(val response: CompletionResponse) : CompletionOutcome()

    data object Cancelled : CompletionOutcome()

    data object Skipped : CompletionOutcome()

    data class Failed(
        val message: String,
        val status: Int? = null,
        val kind: String = "transient",
    ) : CompletionOutcome()
}

enum class CacheMatchType {
    EXACT,
    PARTIAL_TYPING,
    BACKWARD_DELETION,
}

data class CachedSuggestion(
    val scope: String,
    val prefix: String,
    val suffix: String,
    val text: String,
)

data class CacheHit(
    val text: String,
    val match: CacheMatchType,
    val source: CachedSuggestion,
)
