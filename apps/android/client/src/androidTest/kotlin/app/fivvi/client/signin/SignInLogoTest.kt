package app.fivvi.client.signin

import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.unit.dp
import app.fivvi.client.Mode
import app.fivvi.client.enableLookAccessibilityChecks
import app.fivvi.client.pixels
import app.fivvi.client.showInMode
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.signin.SignInActions
import app.fivvi.core.signin.SignInScreen
import app.fivvi.core.signin.SignInState
import app.fivvi.core.signin.SignInTags
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC15, the design line of #634 (NL, EN; light and dark): both sign-in steps of Fivvi show the plain day dial, 84 dp on
// the email step and 64 dp on the code step, in the version drawn for the mode, named Fivvi, and no letter mark or PRO.
@RunWith(Parameterized::class)
class SignInLogoTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val noActions = SignInActions({}, {}, {}, {}, {}, {}, {})

    private fun show(state: SignInState) = compose.showInMode(mode, language) {
        SignInScreen(state, noActions, logo = ClientSignInLogo)
    }

    @Test
    fun E020_AC15_theEmailStepShowsTheDialAt84dpNamedFivvi() {
        show(SignInState.EmailEntry())

        compose.onNodeWithTag(SignInTags.LOGO).assertIsDisplayed().assertWidthIsEqualTo(84.dp)
            .assertHeightIsEqualTo(84.dp).assertContentDescriptionEquals("Fivvi")
    }

    @Test
    fun E020_AC15_theCodeStepShowsItAt64dp() {
        show(SignInState.CodeEntry("anna@example.com"))

        compose.onNodeWithTag(SignInTags.LOGO).assertIsDisplayed().assertWidthIsEqualTo(64.dp)
            .assertHeightIsEqualTo(64.dp).assertContentDescriptionEquals("Fivvi")
    }

    // The light dial has a white tile and the dark one a near black tile: the pixel at the tile's left edge tells which one
    // the screen drew in this mode.
    @Test
    fun E020_AC15_theDialIsTheLightOneInLightModeAndTheDarkOneInDarkMode() {
        show(SignInState.EmailEntry())

        val image = compose.onNodeWithTag(SignInTags.LOGO).pixels()
        val pixel = image[image.width / 14, image.height / 2]
        val brightness = (pixel.red + pixel.green + pixel.blue) / 3
        if (mode.dark) {
            assertTrue("dark mode draws the dark dial, got brightness $brightness", brightness < 0.25f)
        } else {
            assertTrue("light mode draws the light dial, got brightness $brightness", brightness > 0.85f)
        }
    }

    @Test
    fun E020_AC15_noLetterMarkNoProAndNoSeparateNameAreShown() {
        show(SignInState.EmailEntry())

        compose.onNodeWithText("F").assertDoesNotExist()
        compose.onNodeWithText("PRO").assertDoesNotExist()
        compose.onNodeWithText("Fivvi Pro").assertDoesNotExist()
        compose.onNodeWithText("Fivvi").assertDoesNotExist()
    }

    // AC15: the accessibility checks of Google's framework (touch targets, speakable text, text contrast and the rest) run over
    // the whole screen of each sign-in step as it opens, in this mode and language, and fail the test on a warning or an error.
    // The code step's field is focused, so its label is in the accent (accentText, 4.5:1; the fill is 4.11:1).
    @Test
    fun E020_AC15_theEmailStepPassesTheAccessibilityChecks() {
        show(SignInState.EmailEntry())

        compose.enableLookAccessibilityChecks(mode)
        compose.onRoot().tryPerformAccessibilityChecks()
    }

    @Test
    fun E020_AC15_theCodeStepPassesTheAccessibilityChecks() {
        show(SignInState.CodeEntry("anna@example.com"))

        compose.enableLookAccessibilityChecks(mode)
        compose.onRoot().tryPerformAccessibilityChecks()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
