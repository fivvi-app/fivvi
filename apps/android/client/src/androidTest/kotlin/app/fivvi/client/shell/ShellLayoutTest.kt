package app.fivvi.client.shell

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.client.account.AccountState
import app.fivvi.client.assertButtonFits
import app.fivvi.client.assertNotCutOff
import app.fivvi.client.assertWraps
import app.fivvi.client.localizedString
import app.fivvi.client.showAtLargestFontScale
import app.fivvi.client.textLayout
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// Every screen and state of the shell at the largest font scale (200%) on a small phone, in each catalog language:
// text wraps instead of being cut off, the screens scroll, and buttons and tabs keep their 48 dp.
@RunWith(Parameterized::class)
class ShellLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val trainer = AccountState.Loaded("Sarah de Vries-Jansen", "a.long.address.for.a.trainer@example.com", true)

    private fun actions(signingOut: Boolean = false) = ProfileActions(
        onRetry = {},
        language = language,
        languageSaveFailed = true,
        onChooseLanguage = {},
        onSignOut = {},
        signingOut = signingOut,
    )

    @Test
    fun E017_largestFont_noWorkspaceWrapsAndScrollsToTheFivviProLine() {
        compose.showAtLargestFontScale(language, height = 640.dp) {
            ClientShell(online = false, selected = Tab.HOME, onSelect = {}) {
                NoWorkspaceScreen(trainer, HomeTags, onRetry = {})
            }
        }

        compose.assertWraps(HomeTags.title, wraps = true)
        compose.assertWraps(HomeTags.haveLink, wraps = true)
        compose.onNodeWithTag(HomeTags.teamHint).performScrollTo()
        compose.assertWraps(HomeTags.teamHint, wraps = true)
        compose.assertWraps(ShellTags.OFFLINE, wraps = true)
    }

    @Test
    fun E017_largestFont_tabsShowTheirLabelsInFullAndKeepTheirTouchTargets() {
        compose.showAtLargestFontScale(language, height = 640.dp) {
            ClientShell(online = true, selected = Tab.HOME, onSelect = {}) {}
        }

        Tab.entries.forEach { tab ->
            val label = localizedString(language, tab.label)
            compose.onNode(hasAnyAncestor(hasTestTag(tab.tag)) and hasText(label), useUnmergedTree = true)
                .textLayout().assertNotCutOff("the label of ${tab.tag}")
            val bounds = compose.onNodeWithTag(tab.tag).getUnclippedBoundsInRoot()
            val (height, width) = (bounds.bottom - bounds.top) to (bounds.right - bounds.left)
            assertTrue("${tab.tag} is $height high", height >= 48.dp)
            assertTrue("${tab.tag} is $width wide", width >= 48.dp)
        }
    }

    @Test
    fun E017_largestFont_profielWrapsAndItsButtonsFit() {
        compose.showAtLargestFontScale(language, height = 640.dp) {
            ProfileScreen(trainer, actions(), version = "0.1.0")
        }

        compose.assertWraps(ProfileTags.EMAIL, wraps = true)
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).performScrollTo()
        compose.assertButtonFits(ProfileTags.SIGN_OUT)
        compose.assertWraps(ProfileTags.LANGUAGE_ERROR, wraps = true)
        compose.onNodeWithTag(ProfileTags.VERSION).performScrollTo()
        compose.assertWraps(ProfileTags.VERSION)
    }

    @Test
    fun E017_largestFont_errorStateWrapsAndTheRetryButtonFits() {
        compose.showAtLargestFontScale(language, height = 640.dp) {
            NoWorkspaceScreen(AccountState.Failed, HomeTags, onRetry = {})
        }

        compose.assertWraps(HomeTags.error, wraps = true)
        compose.assertButtonFits(HomeTags.retry)
    }

    @Test
    fun E017_talkBack_loadingAndSigningOutAreLabelled() {
        val description = localizedString(language, R.string.common_loading)
        compose.showAtLargestFontScale(language, height = 640.dp) {
            ProfileScreen(AccountState.Loading, actions(signingOut = true), version = "0.1.0")
        }

        listOf(ProfileTags.LOADING, ProfileTags.SIGNING_OUT).forEach {
            compose.onNodeWithTag(it).assert(
                SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(description)),
            )
        }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
