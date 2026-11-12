package app.fivvi.pro.clients

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.LightColorScheme
import app.fivvi.pro.kit.Mode
import app.fivvi.pro.kit.near
import app.fivvi.pro.kit.pixels
import app.fivvi.pro.kit.px
import app.fivvi.pro.kit.showKit
import java.time.Instant
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC15 for #633 (NL, EN; light and dark): Klanten, the client profile and the new-client form are drawn in the look of
// the prototype, from the kit: the large title on the grouped grey canvas, the pill search field, rows with an avatar on
// the card colour, the details as a grouped list, fields and pill buttons in the form. Behaviour is ClientsScreenTest's.
@RunWith(Parameterized::class)
class ClientsLookTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.EN)
    private val mark = clientOf("Mark Jansen", "mark.jansen@example.com")

    private val actions = ClientsActions(
        onBack = {},
        onQueryChange = {},
        onRefresh = {},
        onRetry = {},
        onOpen = {},
        onAdd = {},
    )

    private val fieldActions = ClientFormActions({}, {}, {}, {}, {}, {})

    private fun showList(state: ClientsState = ClientsState.Loaded(listOf(anna, mark), 2, Instant.EPOCH)) =
        compose.showKit(mode, language) {
            ClientsScreen(state, "", false, WorkspaceDefaults(), "John's Gym", actions)
        }

    private fun showProfile() = compose.showKit(mode, language) {
        ClientProfileScreen(
            ClientProfileState.Loaded(anna),
            Locale.NL_NL,
            "John's Gym",
            null,
            ClientProfileActions({}, {}, {}, {}, {}, {}, {}, fieldActions),
        )
    }

    private fun showAdd() = compose.showKit(mode, language) {
        AddClientScreen(
            AddClientState(form = ClientForm(name = "Carla Bos", email = "carla@example.com")),
            Locale.NL_NL,
            AddClientActions({}, {}, fieldActions),
        )
    }

    // A point of a row clear of its text, to the right of it or (atStart) in its left margin: the card colour of the mode, not the canvas.
    private fun assertOnACard(tag: String, share: Float = 0.6f, atStart: Boolean = false) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performScrollTo()
        val pixels = compose.onNodeWithTag(tag, useUnmergedTree = true).pixels()
        val card = mode.tokens.bgSurface
        val x = if (atStart) 4.dp.px() else (pixels.width * share).toInt()
        val inside = pixels[x, pixels.height / 2]
        assertTrue("$tag is on the card colour, got $inside", inside.near(card, 0.02f))
        assertTrue("the card differs from the canvas", !mode.tokens.bgCanvas.near(card, 0.02f))
    }

    // A pill: the corner of its box shows the canvas behind it, the middle of its end does not.
    private fun assertIsAPill(tag: String) {
        val pixels = compose.onNodeWithTag(tag, useUnmergedTree = true).pixels()
        val canvas = mode.tokens.bgCanvas
        assertTrue("$tag has a round corner, got ${pixels[1, 1]}", pixels[1, 1].near(canvas, 0.02f))
        assertTrue(
            "$tag is filled at its end, got ${pixels[pixels.width - pixels.height / 2, pixels.height / 2]}",
            !pixels[pixels.width - pixels.height / 2, pixels.height / 2].near(canvas, 0.02f),
        )
    }

    @Test
    fun E020_AC15_klantenShowsTheCanvasTheLargeTitleThenTheSearchThenTheRows() {
        showList()

        val screen = compose.onRoot().pixels()
        assertTrue("the canvas colour at the corner", screen[1, 1].near(mode.tokens.bgCanvas, 0.02f))
        val title = compose.onNodeWithTag(ClientsTags.TITLE).getUnclippedBoundsInRoot()
        val search = compose.onNodeWithTag(ClientsTags.SEARCH).getUnclippedBoundsInRoot()
        val row = compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").getUnclippedBoundsInRoot()
        assertTrue("the title is above the search", title.bottom <= search.top)
        assertTrue("the search is above the first row", search.bottom <= row.top)
        assertTrue("the title is large", title.bottom - title.top >= 34.dp)
    }

    @Test
    fun E020_AC15_theSearchFieldIsAPillOnTheRaisedSurface() {
        showList()

        val search = compose.onNodeWithTag(ClientsTags.SEARCH).pixels()
        val scheme = if (mode.dark) DarkColorScheme else LightColorScheme
        assertTrue("the corner shows the canvas", search[1, 1].near(mode.tokens.bgCanvas, 0.02f))
        val end = search[search.width - search.height / 2, search.height / 2]
        assertTrue(
            "the field is on ${scheme.surfaceContainerHigh}, got $end",
            end.near(scheme.surfaceContainerHigh, 0.02f),
        )
    }

    @Test
    fun E020_AC15_clientsAreRowsOnTheCardColourWithAnAvatarAndTheAddActionIsAPill() {
        showList()

        assertOnACard("${ClientsTags.ROW}.${anna.id}", share = 0.95f)
        assertOnACard("${ClientsTags.ROW}.${mark.id}", share = 0.95f)
        compose.onNodeWithTag("${ClientsTags.ROW_AVATAR}.${anna.id}", useUnmergedTree = true)
            .assertWidthIsEqualTo(44.dp).assertHeightIsEqualTo(44.dp)
        compose.onNodeWithTag(ClientsTags.ADD).assertHeightIsAtLeast(48.dp)
        assertIsAPill(ClientsTags.ADD)
    }

    @Test
    fun E020_AC15_theEmptyListSaysSoOnACard() {
        showList(ClientsState.Loaded(emptyList(), 0, Instant.EPOCH))

        // The text is centred and the card runs under it: a pixel at the start of the text's box is the card's.
        val pixels = compose.onNodeWithTag(ClientsTags.EMPTY).pixels()
        assertTrue(
            "the empty text is on the card colour, got ${pixels[2, pixels.height / 2]}",
            pixels[2, pixels.height / 2].near(mode.tokens.bgSurface, 0.02f),
        )
    }

    @Test
    fun E020_AC15_theClientProfileHasACentredAvatarAndNameAboveItsDetailsOnCards() {
        showProfile()

        val avatar = compose.onNodeWithTag(ClientProfileTags.AVATAR, useUnmergedTree = true)
        avatar.assertWidthIsEqualTo(88.dp)
        val screen = compose.onRoot().getUnclippedBoundsInRoot()
        val box = avatar.getUnclippedBoundsInRoot()
        assertTrue("the avatar is centred", kotlin.math.abs((box.left + box.right).value - screen.right.value) <= 2f)
        val title = compose.onNodeWithTag(ClientProfileTags.TITLE).getUnclippedBoundsInRoot()
        assertTrue("the name is under the avatar", title.top >= box.bottom)
        assertTrue("the name is centred", kotlin.math.abs((title.left + title.right).value - screen.right.value) <= 2f)
        assertOnACard("${ClientProfileTags.NAME}.row", atStart = true)
        assertOnACard("${ClientProfileTags.EMAIL}.row", atStart = true)
        assertOnACard("${ClientProfileTags.LANGUAGE}.row", atStart = true)
        compose.onNodeWithTag(ClientProfileTags.EDIT).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun E020_AC15_theDetailsShowTheValueAtTheEndOfItsRow() {
        showProfile()

        val row = compose.onNodeWithTag("${ClientProfileTags.EMAIL}.row", useUnmergedTree = true)
            .getUnclippedBoundsInRoot()
        val value = compose.onNodeWithTag(ClientProfileTags.EMAIL, useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertTrue("the value is at the end of the row", row.right - value.right <= 20.dp)
    }

    @Test
    fun E020_AC15_theNewClientFormHasFieldsPillButtonsAndTheLanguageOnCards() {
        showAdd()

        compose.onNodeWithTag(AddClientTags.SUBMIT).assertHeightIsAtLeast(48.dp)
        assertOnACard("${AddClientTags.PREFIX}.language.default")
        assertOnACard("${AddClientTags.PREFIX}.language.nl-NL")
        assertOnACard("${AddClientTags.PREFIX}.language.en")
        val email = compose.onNodeWithTag("${AddClientTags.PREFIX}.email").getUnclippedBoundsInRoot()
        val note = compose.onNodeWithTag(AddClientTags.DESCRIPTION).getUnclippedBoundsInRoot()
        assertTrue("the note is under the fields", note.top >= email.bottom)
    }

    @Test
    fun E020_AC15_aDuplicateOffersItsTwoWaysOnAsPillButtons() {
        compose.showKit(mode, language) {
            AddClientScreen(
                AddClientState(
                    form = ClientForm(name = "Carla Bos", email = "anna@example.com"),
                    duplicate = Duplicate(anna.id, "Anna de Vries"),
                ),
                Locale.NL_NL,
                AddClientActions({}, {}, fieldActions),
            )
        }

        compose.onNodeWithTag("${AddClientTags.PREFIX}.openExisting").performScrollTo().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("${AddClientTags.PREFIX}.otherEmail").performScrollTo().assertHeightIsAtLeast(48.dp)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
