package app.fivvi.client.shell

import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.unit.dp
import app.fivvi.client.Mode
import app.fivvi.client.account.AccountState
import app.fivvi.client.near
import app.fivvi.client.pixels
import app.fivvi.client.px
import app.fivvi.client.showInMode
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.LightColorScheme
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityCheckResult.AccessibilityCheckResultType
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityViewCheckResult
import com.google.android.apps.common.testing.accessibility.framework.checks.TextContrastCheck
import com.google.android.apps.common.testing.accessibility.framework.integrations.espresso.AccessibilityValidator
import org.hamcrest.BaseMatcher
import org.hamcrest.Description
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

    private fun abs(value: Float) = kotlin.math.abs(value)

    @Test
    fun E020_AC15_theLanguagesAreRowsOnTheCardColourAndSigningOutIsAPill() {
        showProfile()

        assertOnACard("${ProfileTags.LANGUAGE}.nl-NL")
        assertOnACard("${ProfileTags.LANGUAGE}.en")
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).performScrollTo().assertHeightIsAtLeast(48.dp)
        // A pill: 7 dp in from the corner is outside a 50 dp-high pill's corner circle, so the canvas shows there.
        val pixels = compose.onNodeWithTag(ProfileTags.SIGN_OUT).pixels()
        assertTrue("the corner shows the canvas, got ${pixels[1, 1]}", pixels[1, 1].near(mode.tokens.bgCanvas, 0.02f))
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

    // The one text-contrast result the tokens allow (ADR-032, `native-secondary-text` in packages/design-tokens): the secondary
    // text of the native apps in light mode, `color.text.secondary` (#85858B), is 3.3:1 on the canvas and 3.7:1 on cards, not
    // 4.5:1, and the floor the ADR sets is 3:1. Only a TextContrastCheck result whose foreground colour (the result's metadata,
    // not its message) is that colour and whose ratio is at least 3:1 is accepted, and only in light mode.
    private fun secondaryTextInLightMode() = object : BaseMatcher<AccessibilityViewCheckResult>() {
        private val grey = mode.tokens.textSecondary.toArgb() and RGB

        override fun matches(actual: Any?): Boolean {
            if (mode.dark || actual !is AccessibilityViewCheckResult) return false
            if (actual.accessibilityHierarchyCheck != TextContrastCheck::class.java) return false
            val metadata = actual.metadata ?: return false
            if (!metadata.containsKey(TextContrastCheck.KEY_FOREGROUND_COLOR)) return false
            if (!metadata.containsKey(TextContrastCheck.KEY_CONTRAST_RATIO)) return false
            return metadata.getInt(TextContrastCheck.KEY_FOREGROUND_COLOR) and RGB == grey &&
                metadata.getDouble(TextContrastCheck.KEY_CONTRAST_RATIO) >= MIN_SECONDARY_CONTRAST
        }

        override fun describeTo(description: Description) {
            description.appendText("a text contrast result of the secondary text colour, at least 3:1, in light mode")
        }
    }

    // AC15: the accessibility checks of Google's framework run over the whole screen, in this mode and language, and fail the
    // test on a warning or an error. The screen scrolls: it is checked again after scrolling to its last element.
    private fun assertAccessible(vararg lastTags: String) {
        compose.enableAccessibilityChecks(
            AccessibilityValidator()
                .setRunChecksFromRootView(true)
                .setThrowExceptionFor(AccessibilityCheckResultType.WARNING)
                .setSuppressingResultMatcher(secondaryTextInLightMode()),
        )
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
        private const val RGB = 0xFFFFFF
        private const val MIN_SECONDARY_CONTRAST = 3.0

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
