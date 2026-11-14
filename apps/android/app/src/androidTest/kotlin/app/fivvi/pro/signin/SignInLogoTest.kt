package app.fivvi.pro.signin

import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.signin.SignInActions
import app.fivvi.core.signin.SignInLogo
import app.fivvi.core.signin.SignInScreen
import app.fivvi.core.signin.SignInState
import app.fivvi.core.signin.SignInTags
import app.fivvi.pro.R as ProR
import app.fivvi.pro.kit.Mode
import app.fivvi.pro.kit.pixels
import app.fivvi.pro.kit.showKit
import app.fivvi.pro.localizedString
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC15, the design line of #632 (NL, EN; light and dark): both sign-in steps show the Fivvi Pro day dial, 84 dp on
// the email step and 64 dp on the code step, in the version drawn for the mode, named Fivvi Pro, and no letter mark.
@RunWith(Parameterized::class)
class SignInLogoTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val noActions = SignInActions({}, {}, {}, {}, {}, {}, {})

    // The logo the Fivvi Pro app passes (MainActivity): its own drawables in each mode, and the app's name.
    private val logo = SignInLogo(
        ProR.drawable.fivvi_pro_dial_light,
        ProR.drawable.fivvi_pro_dial_dark,
        R.string.app_name,
    )

    private fun show(state: SignInState) = compose.showKit(mode, language) {
        SignInScreen(state, noActions, logo = logo)
    }

    @Test
    fun E020_AC15_theEmailStepShowsTheProDialAt84dpNamedFivviPro() {
        show(SignInState.EmailEntry())

        compose.onNodeWithTag(SignInTags.LOGO).assertIsDisplayed().assertWidthIsEqualTo(84.dp)
            .assertHeightIsEqualTo(84.dp)
            .assertContentDescriptionEquals(localizedString(language, R.string.app_name))
        compose.onNodeWithTag(SignInTags.LOGO).assertContentDescriptionEquals("Fivvi Pro")
    }

    @Test
    fun E020_AC15_theCodeStepShowsItAt64dp() {
        show(SignInState.CodeEntry("owner@example.com"))

        compose.onNodeWithTag(SignInTags.LOGO).assertIsDisplayed().assertWidthIsEqualTo(64.dp)
            .assertHeightIsEqualTo(64.dp).assertContentDescriptionEquals("Fivvi Pro")
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
    fun E020_AC15_noLetterMarkIsShown() {
        show(SignInState.EmailEntry())

        compose.onNodeWithText("F").assertDoesNotExist()
        compose.onNodeWithText("Fivvi Pro").assertDoesNotExist()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
