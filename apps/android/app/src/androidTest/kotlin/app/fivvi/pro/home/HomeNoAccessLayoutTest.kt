package app.fivvi.pro.home

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.assertWraps
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// The no-access state at the largest font scale (F030 AC9): the line that points a client to the Fivvi app wraps and is
// shown in full, in both languages.
@RunWith(Parameterized::class)
class HomeNoAccessLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun test_F030_AC9_clientHintWrapsAtTheLargestFontScale() {
        compose.showAtLargestFontScale(language) {
            HomeScreen(
                me = MeState.Loaded("mark@example.com", HomeDestination.NoAccess),
                signingOut = false,
                onRetryMe = {},
                onSignOut = {},
                onOpenWeb = {},
                onOpenProfile = {},
            )
        }

        compose.onNodeWithTag(HomeTags.NO_ACCESS_CLIENT_HINT)
            .assertIsDisplayed()
            .assertTextEquals(localizedString(language, R.string.no_access_client_hint))
        compose.assertWraps(HomeTags.NO_ACCESS_CLIENT_HINT, wraps = true)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
