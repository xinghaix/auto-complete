package io.autocomplete.context

/**
 * Tracks one live owner per scope and uses owner identity to reject stale cleanup/writeback.
 */
class ScopedAttachmentRegistry<K : Any, V : Any>(
    private val isInactive: (V) -> Boolean = { false },
) {
    private val entries = LinkedHashMap<K, V>()

    @Synchronized
    fun attach(
        key: K,
        owner: V,
    ): Boolean {
        val existing = entries[key]
        if (existing === owner) return false
        if (existing != null && !isInactive(existing)) return false
        entries[key] = owner
        return true
    }

    @Synchronized
    fun detach(
        key: K,
        owner: V,
    ): Boolean {
        if (entries[key] !== owner) return false
        entries.remove(key)
        return true
    }

    @Synchronized
    fun isCurrent(
        key: K,
        owner: V,
    ): Boolean = entries[key] === owner && !isInactive(owner)
}
