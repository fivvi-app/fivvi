package app.fivvi.client

import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.test.core.app.ApplicationProvider
import app.fivvi.core.AppLanguage

/** How long a UI test waits for something that happens off the main thread (the token is stored or deleted there). */
const val UI_TIMEOUT_MILLIS = 5_000L

/** Waits until a node with [tag] is on screen. */
fun ComposeTestRule.waitUntilTagExists(tag: String) = waitUntil(UI_TIMEOUT_MILLIS) {
    onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
}

/** The generated catalog's text for [id] in [language], with [formatArgs]: what a screen in that language shows. */
fun localizedString(language: AppLanguage, @StringRes id: Int, vararg formatArgs: Any): String {
    val app = ApplicationProvider.getApplicationContext<ClientApplication>()
    val configuration = Configuration(app.resources.configuration).apply { setLocales(LocaleList(language.locale)) }
    return app.createConfigurationContext(configuration).getString(id, *formatArgs)
}
