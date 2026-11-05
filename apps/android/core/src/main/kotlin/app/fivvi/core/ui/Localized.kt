package app.fivvi.core.ui

import android.content.ContextWrapper
import android.content.res.Configuration
import android.content.res.Resources
import android.os.LocaleList
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.fivvi.core.AppLanguage

/**
 * The screens in [content] read their strings from a context that follows [language], so a switch re-renders in place:
 * no restart, and what was typed stays in the view models. Android's own resource match is never the input (the default
 * resources are Dutch). Call it once, at the root of `setContent`, where the context is the activity.
 */
@Composable
fun Localized(language: AppLanguage, content: @Composable () -> Unit) {
    val base = LocalContext.current
    val configuration = remember(language) {
        Configuration(base.resources.configuration).apply { setLocales(LocaleList(language.locale)) }
    }
    val localized = remember(language) {
        val resources = base.createConfigurationContext(configuration).resources
        object : ContextWrapper(base) {
            override fun getResources(): Resources = resources
        }
    }
    CompositionLocalProvider(
        LocalContext provides localized,
        LocalConfiguration provides configuration,
        LocalResources provides localized.resources,
        content = content,
    )
}

/**
 * Runs [action] each time the app comes back to the foreground, not at the start that composing this already covers (the
 * observer is told the current state when it is added).
 */
@Composable
fun OnForeground(action: () -> Unit) {
    var first by remember { mutableStateOf(true) }
    LifecycleEventEffect(Lifecycle.Event.ON_START) {
        if (first) first = false else action()
    }
}
