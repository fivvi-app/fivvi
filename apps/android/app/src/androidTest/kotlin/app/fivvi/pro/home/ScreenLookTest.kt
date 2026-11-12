package app.fivvi.pro.home

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.hello.HelloState
import app.fivvi.pro.kit.Mode
import app.fivvi.pro.kit.near
import app.fivvi.pro.kit.pixels
import app.fivvi.pro.kit.showKit
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC15 for #632 (NL, EN; light and dark): Home and Profiel are drawn in the look of the prototype, from the kit: the
// grouped grey canvas with the card colour for its rows and cards, and pill buttons of 48 dp.
@RunWith(Parameterized::class)
class ScreenLookTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val workspace = ProfileWorkspace(
        id = workspaceIdOf("John's Gym"),
        slug = "johns-gym",
        name = "John's Gym",
        role = ProfileRole.Owner,
        trainsHere = false,
        canSwitchTrainsHere = true,
    )

    private fun showHome() = compose.showKit(mode, language) {
        HomeScreen(
            HelloState.Loaded(R.string.hello_title),
            MeState.Loaded("john@example.com", HomeDestination.Workspace("John's Gym", workspace.id)),
            signingOut = false,
            onRetryHello = {},
            onRetryMe = {},
            onSignOut = {},
            onOpenWeb = {},
            onOpenProfile = {},
            onOpenClients = {},
        )
    }

    private fun showProfile() = compose.showKit(mode, language) {
        ProfileScreen(
            ProfileState.Loaded("John", "john@example.com", listOf(workspace)),
            editor = null,
            ProfileActions(
                onRetry = {},
                onEditName = {},
                onNameInput = {},
                onSaveName = {},
                onCancelName = {},
                onSetTrainsHere = { _, _ -> },
                language = language,
                languageSaveFailed = false,
                onChooseLanguage = {},
                currentWorkspace = workspace.id,
                onSelectWorkspace = {},
                onOpenSitePage = {},
            ),
        )
    }

    // The middle of a row, to the right of its text: the card colour of the mode, not the canvas.
    private fun assertRowIsACard(tag: String) {
        compose.onNodeWithTag(tag).performScrollTo()
        val pixels = compose.onNodeWithTag(tag).pixels()
        val card = mode.tokens.bgSurface
        val inside = pixels[pixels.width * 6 / 10, pixels.height / 2]
        assertTrue("$tag is on the card colour, got $inside", inside.near(card, 0.02f))
        assertTrue("the card differs from the canvas", !mode.tokens.bgCanvas.near(card, 0.02f))
    }

    @Test
    fun E020_AC15_homeRowsAreOnTheCardColourAndTheButtonIsAPill() {
        showHome()

        assertRowIsACard(HomeTags.OPEN_CLIENTS)
        assertRowIsACard(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun E020_AC15_homeShowsTheCanvasBehindItsCards() {
        showHome()

        val screen = compose.onRoot().pixels()
        assertTrue("the canvas colour at the corner", screen[1, 1].near(mode.tokens.bgCanvas, 0.02f))
    }

    @Test
    fun E020_AC15_profielGroupsItsDetailsWorkspacesAndLanguageOnCards() {
        showProfile()

        assertRowIsACard("${ProfileTags.WORKSPACE}.${workspace.slug}")
        assertRowIsACard("${ProfileTags.TRAINS_HERE}.${workspace.slug}")
        assertRowIsACard("${ProfileTags.LANGUAGE}.${language.tag}")
        assertRowIsACard(ProfileTags.SUPPORT)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
