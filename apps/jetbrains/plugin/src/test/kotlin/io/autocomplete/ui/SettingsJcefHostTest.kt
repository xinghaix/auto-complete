package io.autocomplete.ui

import java.lang.reflect.InvocationTargetException
import org.junit.Assert.assertSame
import org.junit.Test

class SettingsJcefHostTest {
    @Test
    fun unwrapsTheCauseThrownByReflectiveMount() {
        val root = IllegalStateException("JBCefApp.isSupported() == false")

        assertSame(root, SettingsJcefHost.unwrapMountFailure(InvocationTargetException(root)))
    }

    @Test
    fun unwrapsNestedReflectiveMountFailures() {
        val root = IllegalStateException("JCEF native initialization failed")

        assertSame(
            root,
            SettingsJcefHost.unwrapMountFailure(InvocationTargetException(InvocationTargetException(root))),
        )
    }

    @Test
    fun preservesNonReflectiveMountFailures() {
        val root = IllegalStateException("settings-ui bundle not found")

        assertSame(root, SettingsJcefHost.unwrapMountFailure(root))
    }
}
