package io.autocomplete.i18n

import com.intellij.DynamicBundle
import org.jetbrains.annotations.PropertyKey

private const val BUNDLE = "messages.AutoCompleteBundle"

object AutoCompleteBundle : DynamicBundle(BUNDLE) {
    fun message(
        @PropertyKey(resourceBundle = BUNDLE) key: String,
        vararg params: Any,
    ): String = getMessage(key, *params)
}

fun message(
    @PropertyKey(resourceBundle = BUNDLE) key: String,
    vararg params: Any,
): String = AutoCompleteBundle.message(key, *params)
