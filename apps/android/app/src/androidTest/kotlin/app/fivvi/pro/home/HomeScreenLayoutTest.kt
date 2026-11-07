package app.fivvi.pro.home

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.assertButtonFits
import app.fivvi.pro.assertWraps
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC15 (spec #168): the signed-in home at the largest font scale (200%) on a small phone, in each catalog language.
@RunWith(Parameterized::class)
class HomeScreenLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private fun inWorkspace(email: String) =
        MeState.Loaded(email, HomeDestination.Workspace("John's Gym", workspaceIdOf("John's Gym")))

    private fun show(me: MeState, signingOut: Boolean = false, height: Dp = 640.dp) =
        compose.showAtLargestFontScale(language, height = height) {
            HomeScreen(
                me,
                signingOut,
                onRetryMe = {},
                onSignOut = {},
                onOpenWeb = {},
                onOpenProfile = {},
            )
        }

    @Test
    fun F001N_AC15_fontScale200Wraps() {
        show(inWorkspace("a.long.address.for.a.trainer@example.com"))

        compose.assertWraps(HomeTags.SIGNED_IN_AS, wraps = true)
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F002_AC10_setUpOnTheWebWrapsAndTheButtonFits() {
        show(MeState.Loaded("owner@example.com", HomeDestination.SetUpOnWeb))

        compose.assertWraps(HomeTags.SET_UP_ON_WEB, wraps = true)
        compose.assertButtonFits(HomeTags.OPEN_WEB)
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F001N_AC15_touchTargets() {
        show(MeState.Failed)

        compose.assertWraps(HomeTags.ERROR, wraps = true)
        compose.assertButtonFits(HomeTags.RETRY)
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F001N_AC15_smallScreenScrollsAsOneToReachEverything() {
        // A 320 dp high screen at 200%: the workspace name and the account block don't fit together. The name keeps its
        // height (it is not squeezed by the account block) and the screen scrolls to the sign-out button.
        show(inWorkspace("a.long.address.for.a.trainer@example.com"), height = 320.dp)

        compose.assertWraps(HomeTags.WORKSPACE_NAME)
        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.SIGN_OUT).performScrollTo().assertIsDisplayed()
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F001N_AC15_theSignOutButtonIsLabelled() {
        show(inWorkspace("owner@example.com"))

        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(localizedString(language, R.string.sign_out_label))
    }

    @Test
    fun F001N_AC15_signingOutIsLabelledAndAnnounced() {
        show(inWorkspace("owner@example.com"), signingOut = true)

        compose.onNodeWithTag(HomeTags.SIGNING_OUT)
            .assert(hasContentDescription(localizedString(language, R.string.common_loading)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
