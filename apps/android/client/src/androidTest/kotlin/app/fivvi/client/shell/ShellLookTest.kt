package app.fivvi.client.shell

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.unit.dp
import app.fivvi.client.Mode
import app.fivvi.client.account.AccountState
import app.fivvi.client.enableLookAccessibilityChecks
import app.fivvi.client.near
import app.fivvi.client.pixels
import app.fivvi.client.px
import app.fivvi.client.showInMode
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.LightColorScheme
import kotlin.math.abs
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC15 for #634 (NL, EN; light and dark): the tabs and Profiel of Fivvi are drawn in the look of the prototype
// (*Profiel en tegoed*), from the kit: the large title on the grouped grey canvas, the avatar with the name and the address
// centred under it, the language as a grouped list on the card colour, a pill button, the Material 3 navigation bar. What
// they do is ClientAppTest's and ShellLayoutTest's.
@RunWith(Parameterized::class)
class ShellLookTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = AccountState.Loaded("Anna de Vries", "anna@example.com", hasTeamRole = false)
    private val trainer = AccountState.Loaded("Sarah de Vries", "sarah@example.com", hasTeamRole = true)

    private fun actions(languageSaveFailed: Boolean = false) = ProfileActions(
        onRetry = {},
        language = language,
        languageSaveFailed = languageSaveFailed,
        onChooseLanguage = {},
        onSignOut = {},
        signingOut = false,
    )

    private fun showProfile(state: AccountState = anna, languageSaveFailed: Boolean = false) =
        compose.showInMode(mode, language) { ProfileScreen(state, actions(languageSaveFailed), version = "0.1.0") }

    private fun showNoWorkspace(state: AccountState = trainer) = compose.showInMode(mode, language) {
        NoWorkspaceScreen(state, HomeTags, onRetry = {})
    }

    private fun showTabs() = compose.showInMode(mode, language) {
        ClientShell(online = true, selected = Tab.HOME, onSelect = {}) { NoWorkspaceScreen(trainer, HomeTags, {}) }
    }

    private fun assertOnACard(tag: String) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performScrollTo()
        val pixels = compose.onNodeWithTag(tag, useUnmergedTree = true).pixels()
        val inside = pixels[4.dp.px(), pixels.height / 2]
        assertTrue("$tag is on the card colour, got $inside", inside.near(mode.tokens.bgSurface, 0.02f))
        assertTrue("the card differs from the canvas", !mode.tokens.bgCanvas.near(mode.tokens.bgSurface, 0.02f))
    }

    @Test
    fun E020_AC15_profielHasTheLargeTitleOnTheCanvasThenACentredAvatarNameAndAddress() {
        showProfile()

        val screen = compose.onRoot().pixels()
        assertTrue("the canvas colour at the corner", screen[1, 1].near(mode.tokens.bgCanvas, 0.02f))
        val width = compose.onRoot().getUnclippedBoundsInRoot().right.value
        val title = compose.onNodeWithTag(ProfileTags.TITLE).getUnclippedBoundsInRoot()
        val avatar = compose.onNodeWithTag(ProfileTags.AVATAR, useUnmergedTree = true)
        compose.onNodeWithTag(ProfileTags.AVATAR, useUnmergedTree = true).assertWidthIsEqualTo(84.dp)
        avatar.assertHeightIsEqualTo(84.dp)
        val box = avatar.getUnclippedBoundsInRoot()
        val name = compose.onNodeWithTag(ProfileTags.NAME).getUnclippedBoundsInRoot()
        val email = compose.onNodeWithTag(ProfileTags.EMAIL).getUnclippedBoundsInRoot()
        assertTrue("the title is large", title.bottom - title.top >= 34.dp)
        assertTrue("the title is above the avatar", title.bottom <= box.top)
        assertTrue("the avatar is centred", abs((box.left + box.right).value - width) <= 2f)
        assertTrue("the name is under the avatar", name.top >= box.bottom)
        assertTrue("the name is centred", abs((name.left + name.right).value - width) <= 2f)
        assertTrue("the address is under the name", email.top >= name.bottom)
        assertTrue("the address is centred", abs((email.left + email.right).value - width) <= 2f)
    }

    @Test
    fun E020_AC15_theLanguagesAreRowsOnTheCardColourAndSigningOutIsAPill() {
        showProfile()

        assertOnACard("${ProfileTags.LANGUAGE}.nl-NL")
        assertOnACard("${ProfileTags.LANGUAGE}.en")
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).performScrollTo().assertHeightIsAtLeast(48.dp)
        // A pill, not a 20 dp corner: 7 dp in from the left edge the top edge of a 48 dp-high pill's end circle (radius 24 dp)
        // is 7.1 dp down and that of a 20 dp corner 4.8 dp down, so at 6 dp down the canvas shows only through a pill.
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).assertHeightIsEqualTo(48.dp)
        val pixels = compose.onNodeWithTag(ProfileTags.SIGN_OUT).pixels()
        val inCorner = pixels[7.dp.px(), 6.dp.px()]
        assertTrue(
            "a pill shows the canvas 7 dp in and 6 dp down, got $inCorner",
            inCorner.near(mode.tokens.bgCanvas, 0.02f),
        )
        val beside = pixels[pixels.width / 2, pixels.height / 2]
        assertTrue("the button itself is not the canvas", !beside.near(mode.tokens.bgCanvas, 0.02f))
    }

    // A failed save of the language is read out when it appears (a Polite live region on the message, as the screen was before
    // the kit's line), and nothing separates the message from its warning icon: the line sits where the kit puts it, 16 dp
    // in from the screen's margin of 16 dp, the icon's 16 dp and the 4 dp gap before the words.
    @Test
    fun E020_AC15_theLanguageErrorIsAPoliteLiveRegionRightNextToItsIcon() {
        showProfile(languageSaveFailed = true)

        val error = compose.onNodeWithTag(ProfileTags.LANGUAGE_ERROR, useUnmergedTree = true).performScrollTo()
        error.assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        val left = error.getUnclippedBoundsInRoot().left.value
        assertTrue("the message starts 4 dp after the icon (36 dp from the edge), not at $left", abs(left - 36f) <= 1f)
    }

    @Test
    fun E020_AC15_theTabBarIsTheMaterialNavigationBarOnTheContainerColour() {
        showTabs()

        val scheme = if (mode.dark) DarkColorScheme else LightColorScheme
        val bar = compose.onNodeWithTag(ShellTags.TABS).pixels()
        assertTrue("the bar is surfaceContainer, got ${bar[2, 2]}", bar[2, 2].near(scheme.surfaceContainer, 0.02f))
        Tab.entries.forEach { compose.onNodeWithTag(it.tag).assertHeightIsAtLeast(48.dp) }
    }

    @Test
    fun E020_AC15_noWorkspaceHasTheLargeTitleAtTheStartAndItsLinesInACard() {
        showNoWorkspace()

        val title = compose.onNodeWithTag(HomeTags.title).getUnclippedBoundsInRoot()
        val card = compose.onNodeWithTag(HomeTags.haveLink).getUnclippedBoundsInRoot()
        assertTrue("the title is large", title.bottom - title.top >= 34.dp)
        assertTrue("the title starts at the margin, not centred", title.left <= 24.dp)
        assertTrue("the lines are under the title", card.top >= title.bottom)
        val line = compose.onNodeWithTag(HomeTags.haveLink).pixels()
        assertTrue("the line sits on the card colour", line[2, 2].near(mode.tokens.bgSurface, 0.02f))
    }

    // AC15: the accessibility checks of Google's framework run over the whole screen, in this mode and language, and fail the
    // test on a warning or an error. The screen scrolls: it is checked again after scrolling to its last element.
    private fun assertAccessible(vararg lastTags: String) {
        compose.enableLookAccessibilityChecks(mode)
        compose.onRoot().tryPerformAccessibilityChecks()
        lastTags.forEach { compose.onNodeWithTag(it, useUnmergedTree = true).performScrollTo() }
        if (lastTags.isNotEmpty()) {
            compose.waitForIdle()
            compose.onRoot().tryPerformAccessibilityChecks()
        }
    }

    @Test
    fun E020_AC15_profielPassesTheAccessibilityChecks() {
        showProfile(languageSaveFailed = true)
        assertAccessible(ProfileTags.VERSION)
    }

    @Test
    fun E020_AC15_noWorkspaceAndTheTabsPassTheAccessibilityChecks() {
        showTabs()
        assertAccessible(HomeTags.teamHint)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
