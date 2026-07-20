package io.autocomplete.engine

data class InlineTriggerDecision(
    val enabled: Boolean,
    val trigger: Trigger,
    val debounce: Boolean,
)

object InlineTriggerPolicy {
    fun decide(
        enabledNow: Boolean,
        autoTrigger: Boolean,
        directCall: Boolean,
    ): InlineTriggerDecision {
        val trigger = if (directCall) Trigger.MANUAL else Trigger.AUTO
        return InlineTriggerDecision(
            enabled = enabledNow && (directCall || autoTrigger),
            trigger = trigger,
            debounce = trigger == Trigger.AUTO,
        )
    }
}
