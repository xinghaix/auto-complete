package io.autocomplete.context

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScopedAttachmentRegistryTest {
    private class Owner(var closed: Boolean = false)

    @Test
    fun closingOldOwnerCannotDetachReopenedScope() {
        val registry = ScopedAttachmentRegistry<String, Owner> { it.closed }
        val old = Owner()
        val reopened = Owner()

        assertTrue(registry.attach("same-location", old))
        old.closed = true
        assertTrue(registry.attach("same-location", reopened))

        assertFalse(registry.detach("same-location", old))
        assertTrue(registry.isCurrent("same-location", reopened))
    }

    @Test
    fun liveDuplicateAttachmentIsIgnored() {
        val registry = ScopedAttachmentRegistry<String, Owner> { it.closed }
        val first = Owner()
        val duplicate = Owner()

        assertTrue(registry.attach("project", first))
        assertFalse(registry.attach("project", duplicate))
        assertTrue(registry.isCurrent("project", first))
    }
}
