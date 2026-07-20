package io.autocomplete.engine

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InlineTriggerPolicyTest {
    @Test
    fun directCallRemainsEnabledWhenAutomaticTriggeringIsDisabled() {
        val decision =
            InlineTriggerPolicy.decide(
                enabledNow = true,
                autoTrigger = false,
                directCall = true,
            )

        assertTrue(decision.enabled)
        assertEquals(Trigger.MANUAL, decision.trigger)
        assertFalse(decision.debounce)
    }

    @Test
    fun automaticEventIsRejectedWhenAutomaticTriggeringIsDisabled() {
        val decision =
            InlineTriggerPolicy.decide(
                enabledNow = true,
                autoTrigger = false,
                directCall = false,
            )

        assertFalse(decision.enabled)
        assertEquals(Trigger.AUTO, decision.trigger)
        assertTrue(decision.debounce)
    }

    @Test
    fun globalDisableRejectsManualAndAutomaticEvents() {
        assertFalse(InlineTriggerPolicy.decide(false, true, true).enabled)
        assertFalse(InlineTriggerPolicy.decide(false, true, false).enabled)
    }
}
