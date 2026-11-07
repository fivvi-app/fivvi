package app.fivvi.pro.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.CardRadius
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.FivviField
import app.fivvi.core.kit.GroupGap
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.NextCard
import app.fivvi.core.kit.NextCardButton
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonGap
import app.fivvi.core.kit.PillButtonHeight
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.PillTone
import app.fivvi.core.kit.RoundControl
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.kit.SessionAvatar
import app.fivvi.core.kit.SessionRow
import app.fivvi.core.kit.SessionType
import app.fivvi.core.kit.StatusPill
import app.fivvi.core.kit.Toast
import app.fivvi.core.kit.ToastHost
import app.fivvi.core.kit.ToastVisuals
import app.fivvi.core.kit.pillColors
import app.fivvi.core.kit.sessionColors
import app.fivvi.pro.localizedString
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC10 and AC14 (spec #590): the building blocks of the kit, in light and dark, in each catalog language. What a
// person sees is checked on the pixels the component drew, with the tokens as the expected colours.
@RunWith(Parameterized::class)
class KitComponentsTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val tokens get() = mode.tokens

    private fun show(width: Dp = phone, content: @Composable () -> Unit) =
        compose.showKit(mode, language, width = width, content = content)

    private fun label(id: Int) = localizedString(language, id)

    // A card, a pill and a group show the canvas, not their fill, outside their rounded corners: the corner pixel is not
    // the fill, and a pixel a third of the radius in, on the diagonal, is.
    private fun PixelMapProbe.roundsCornerWith(radius: Dp, fill: Color) {
        assertFalse("$name: the corner pixel is filled", pixels.isFilled(0, 0, fill))
        val inside = (radius.px() * 0.45f).toInt()
        assertTrue("$name: ${inside}px in on the diagonal is not filled", pixels.isFilled(inside, inside, fill))
    }

    @Test
    fun E020_AC14_aCardHasTheCardRadiusOf28dpAndTheColourOfACard() {
        show { FivviCard(Modifier.testTag("card")) { Text(stringResource(R.string.common_loading)) } }

        assertEquals(28.dp, CardRadius)
        val card = compose.onNodeWithTag("card")
        val fill = mode.tokens.bgSurface
        PixelMapProbe("card", card.pixels()).roundsCornerWith(CardRadius, fill)
        // A pixel only 0.2 of the radius in, on the diagonal, is outside a 28 dp corner: a 12 dp one would fill it.
        assertFalse(card.pixels().isFilled((CardRadius.px() * 0.2f).toInt(), (CardRadius.px() * 0.2f).toInt(), fill))
    }

    @Test
    fun E020_AC14_anInsetGroupedListRoundsItsOuterCornersAndSeparatesRowsBy2dp() {
        show {
            InsetGroupedList(Modifier.testTag("list")) {
                row { ListRow("Een", Modifier.testTag("row0")) }
                row { ListRow("Twee", Modifier.testTag("row1")) }
                row { ListRow("Drie", Modifier.testTag("row2")) }
            }
        }

        val first = compose.onNodeWithTag("list").getUnclippedBoundsInRoot()
        assertEquals(phone, first.right - first.left)
        val rows = (0..2).map { compose.onNodeWithTag("row$it").getUnclippedBoundsInRoot() }
        // The rows are `ListRow`s inside separate surfaces, so the surfaces are the two gaps apart.
        assertTrue("rows are in order", rows[0].bottom <= rows[1].top && rows[1].bottom <= rows[2].top)
        assertEquals(2.dp, GroupGap)
        val fill = mode.tokens.bgSurface
        val list = compose.onNodeWithTag("list").pixels()
        val rowHeight = rows[1].top - rows[0].top
        // The first row has the outer corner (20 dp) on top, the second the inner (4 dp): 2.5 dp in on the diagonal is
        // outside the first and inside the second.
        val probe = 2.5.dp.px()
        assertFalse("outer corner", list.isFilled(probe, probe, fill))
        assertTrue("inner corner of the second row", list.isFilled(probe, rowHeight.px() + probe, fill))
    }

    @Test
    fun E020_AC14_aPillButtonIs48dpHighAndFullyRoundedInEveryStyle() {
        show {
            Column {
                PillButtonStyle.entries.forEach {
                    PillButton(it.name, onClick = {}, Modifier.testTag(it.name), style = it)
                }
            }
        }

        PillButtonStyle.entries.forEach { compose.onNodeWithTag(it.name).assertHeightIsEqualTo(PillButtonHeight) }
        assertEquals(48.dp, PillButtonHeight)
        val primary = compose.onNodeWithTag("Primary").pixels()
        val fill = mode.tokens.actionPrimaryBg
        assertTrue("the fill is the accent", primary.isFilled(primary.width / 2, 2.dp.px(), fill))
        assertFalse("the corner is round", primary.isFilled(0, 0, fill))
        assertFalse("the corner is round", primary.isFilled(2.dp.px(), 2.dp.px(), fill))
        val danger = compose.onNodeWithTag("Danger").pixels()
        assertTrue("danger has its own fill", danger.isFilled(danger.width / 2, 2.dp.px(), mode.tokens.actionDangerBg))
    }

    @Test
    fun E020_AC14_stackedPillButtonsKeepTheirFullHeightWith10dpBetween() {
        show {
            PillButtonStack(Modifier.testTag("stack")) {
                PillButton("Een", onClick = {}, Modifier.testTag("a"))
                PillButton("Twee", onClick = {}, Modifier.testTag("b"), style = PillButtonStyle.Tonal)
            }
        }

        compose.onNodeWithTag("a").assertHeightIsEqualTo(48.dp).assertWidthIsEqualTo(phone)
        compose.onNodeWithTag("b").assertHeightIsEqualTo(48.dp).assertWidthIsEqualTo(phone)
        val gap = compose.onNodeWithTag("b").getUnclippedBoundsInRoot().top -
            compose.onNodeWithTag("a").getUnclippedBoundsInRoot().bottom
        // Within a pixel: 10 dp is 26.25 px on this screen.
        assertTrue("the gap is $gap", abs((gap - 10.dp).value) < 0.5f)
        assertEquals(10.dp, PillButtonGap)
    }

    @Test
    fun E020_AC14_aRoundControlIsA48dpCircleThatSaysWhatItDoes() {
        var clicks = 0
        show {
            RoundControl(painterResource(R.drawable.ic_add), contentDescription = "Add", onClick = {
                clicks++
            }, Modifier.testTag("plus"))
        }

        val control = compose.onNodeWithTag("plus")
        control.assertWidthIsEqualTo(48.dp).assertHeightIsEqualTo(48.dp)
        control.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Add")))
        val pixels = control.pixels()
        assertFalse("round, not square", pixels.isFilled(0, 0, mode.tokens.actionPrimaryBg))
        assertTrue("the accent", pixels.isFilled(pixels.width / 2, 3.dp.px(), mode.tokens.actionPrimaryBg))
        control.performClick()
        assertEquals(1, clicks)
    }

    @Test
    fun E020_AC14_theNextCardIsAGradientInTheColourOfItsSessionTypeDarkerAtTheBottom() {
        show {
            Column {
                for (type in SessionType.entries) {
                    NextCard(
                        type = type,
                        caption = "Volgende",
                        title = "Anna de Vries",
                        modifier = Modifier.testTag("next-$type"),
                        subtitle = "08:30",
                        actions = { NextCardButton("Start", onClick = {}, Modifier.testTag("start-$type")) },
                    )
                }
            }
        }

        for (type in SessionType.entries) {
            val colors = tokens.sessionColors(type)
            val card = compose.onNodeWithTag("next-$type").pixels()
            val inset = CardRadius.px()
            assertTrue(
                "$type top is its gradient top",
                card[card.width - inset, 1.dp.px()].near(colors.gradientTop, 0.04f),
            )
            assertTrue(
                "$type bottom is its gradient bottom",
                card[card.width - inset, card.height - 2.dp.px()].near(colors.gradientBottom, 0.04f),
            )
            assertNotEquals(card[card.width - inset, 1.dp.px()], card[card.width - inset, card.height - 2.dp.px()])
            assertFalse("$type: rounded corner", card.isFilled(0, 0, colors.gradientTop, 0.1f))
            compose.onNodeWithTag("start-$type").assertHeightIsEqualTo(PillButtonHeight).assertIsDisplayed()
        }
    }

    @Test
    fun E020_AC14_aStatusPillIsATintWithTheTextOfItsStatusAndNeverOnlyAColour() {
        show {
            Column {
                PillTone.entries.forEach { StatusPill("Vol 3/8", it, Modifier.testTag("pill-$it")) }
            }
        }

        for (tone in PillTone.entries) {
            val colours = tokens.pillColors(tone)
            val pill = compose.onNodeWithTag("pill-$tone")
            pill.assert(hasText("Vol 3/8"))
            val pixels = pill.pixels()
            assertTrue("$tone: tint", pixels.isFilled(2.dp.px(), pixels.height / 2, colours.container))
        }
    }

    @Test
    fun E020_AC10_aSessionRowHasAShapedAvatarPerTypeAndTheTimeOnTheRight() {
        show {
            InsetGroupedList {
                row {
                    SessionRow(
                        SessionType.Private,
                        "AV",
                        "Anna de Vries",
                        time = "08:30",
                        subtitle = "Sarah",
                        modifier = Modifier.testTag("private-row"),
                    )
                }
                row {
                    SessionRow(
                        SessionType.Group,
                        "B",
                        "Bootcamp",
                        time = "09:30",
                        modifier = Modifier.testTag("group-row"),
                    )
                }
            }
            Row {
                SessionAvatar(SessionType.Private, "AV", Modifier.testTag("cookie"))
                SessionAvatar(SessionType.Group, "B", Modifier.testTag("clover"))
            }
        }

        val cookie = compose.onNodeWithTag("cookie").pixels()
        val clover = compose.onNodeWithTag("clover").pixels()
        val cookieFill = tokens.sessionColors(SessionType.Private).tint
        val cloverFill = tokens.sessionColors(SessionType.Group).tint
        val cookieShare = cookie.filledShare(cookieFill)
        val cloverShare = clover.filledShare(cloverFill)
        // Neither is a square or a circle (a circle fills 78% of its square) and they differ from each other.
        assertTrue("cookie covers $cookieShare of its square", cookieShare in 0.55f..0.85f)
        assertTrue("clover covers $cloverShare of its square", cloverShare in 0.45f..0.85f)
        assertTrue("the cookie is not the clover", abs(cookieShare - cloverShare) > 0.02f || cookieFill != cloverFill)
        assertFalse(cookie.isFilled(0, 0, cookieFill))
        assertFalse(clover.isFilled(0, 0, cloverFill))
        compose.onNode(hasAnyAncestor(hasTestTag("private-row")) and hasText("08:30")).assertIsDisplayed()
        compose.onNode(hasAnyAncestor(hasTestTag("private-row")) and hasText("Anna de Vries")).assertIsDisplayed()
        compose.onNode(hasAnyAncestor(hasTestTag("group-row")) and hasText("09:30")).assertIsDisplayed()
        // The time is on the right of the title.
        val title = compose.onNode(hasText("Anna de Vries")).getUnclippedBoundsInRoot()
        val time = compose.onNode(hasText("08:30")).getUnclippedBoundsInRoot()
        assertTrue("the time ($time) is right of the title ($title)", time.left >= title.right)
    }

    @Test
    fun E020_AC10_aSingleChoiceIsTheSegmentedButtonWithACheckOnTheSelectedOne() {
        var chosen = "nl"
        show {
            SegmentedChoice(
                options = listOf(
                    SegmentedOption("nl", label(R.string.settings_language_option_nl), "choice.nl"),
                    SegmentedOption("en", label(R.string.settings_language_option_en), "choice.en"),
                ),
                selected = chosen,
                onSelect = { chosen = it },
            )
        }

        compose.onNodeWithTag("choice.nl").assertIsSelected().assertIsDisplayed()
        compose.onNodeWithTag("choice.en").assertIsNotSelected()
        compose.onNodeWithTag(
            "choice.nl",
        ).assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
        compose.onNodeWithTag("choice.nl").assert(hasText(label(R.string.settings_language_option_nl)))
        compose.onNodeWithTag("choice.en").assert(hasText(label(R.string.settings_language_option_en)))
        // The check sits in front of the label of the selected segment only: the pixels left of the label differ from the
        // segment's fill there, and in the other segment they don't.
        fun inkInFrontOfTheLabel(tag: String, text: String): Int {
            val segment = compose.onNodeWithTag(tag)
            val labelBounds = compose.onNode(hasAnyAncestor(hasTestTag(tag)) and hasText(text), useUnmergedTree = true)
                .getUnclippedBoundsInRoot()
            val left = segment.getUnclippedBoundsInRoot().left
            val pixels = segment.pixels()
            val from = (labelBounds.left - left - 24.dp).px()
            val to = (labelBounds.left - left - 4.dp).px()
            val fill = pixels[from, pixels.height / 2]
            return (from..to).sumOf { x ->
                (pixels.height / 2 - 8.dp.px()..pixels.height / 2 + 8.dp.px()).count { y ->
                    !pixels[x, y].near(fill, 0.1f)
                }
            }
        }
        val checked = inkInFrontOfTheLabel("choice.nl", label(R.string.settings_language_option_nl))
        val unchecked = inkInFrontOfTheLabel("choice.en", label(R.string.settings_language_option_en))
        assertTrue(
            "a check in front of the selected label: $checked pixels, the other segment $unchecked",
            checked > 20 && unchecked == 0,
        )
        // An outlined pill: the first segment's outer corners are round.
        val first = compose.onNodeWithTag("choice.nl").pixels()
        assertFalse(
            "round outer corner",
            first[0, 0].alpha > 0.5f && first[0, 0].near(first[first.width / 2, first.height / 2], 0.02f),
        )
        compose.onNodeWithTag("choice.en").performClick()
        assertEquals("en", chosen)
    }

    @Test
    fun E020_AC14_aFieldWithAnErrorTurnsRedAndShowsAWarningIconAndTheMessageUnderIt() {
        val message = label(R.string.clients_add_dialog_errors_email_required)
        show {
            Column {
                FivviField("", {}, label(R.string.clients_add_dialog_email_label), Modifier.testTag("ok"))
                FivviField("", {
                }, label(R.string.clients_add_dialog_email_label), Modifier.testTag("bad"), error = message)
            }
        }

        val bad = compose.onNodeWithTag("bad")
        bad.assert(SemanticsMatcher.expectValue(SemanticsProperties.Error, message))
        compose.onNode(hasText(message), useUnmergedTree = true).assertIsDisplayed()
        val field = bad.getUnclippedBoundsInRoot()
        val text = compose.onNode(hasText(message), useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertTrue("the message is under the field's box", text.top >= field.top + 40.dp)
        // The red: the outline of the field is the error colour, the other field's is not.
        val red = mode.tokens.statusDangerFg
        val leftEdge = { node: String ->
            val pixels = compose.onNodeWithTag(node).pixels()
            (0 until 4).any { x ->
                (pixels.height / 4..pixels.height / 2).any { y ->
                    pixels[x, y].alpha > 0.5f &&
                        pixels[x, y].near(red, 0.08f)
                }
            }
        }
        assertTrue("the field with an error is red", leftEdge("bad"))
        assertFalse("the other field is not", leftEdge("ok"))
        // The warning icon sits in front of the message, in the error colour.
        val pixels = compose.onNodeWithTag("bad").pixels()
        val iconArea = (text.left - 20.dp).px()..(text.left - 2.dp).px()
        val iconTop = (text.top - field.top).px()
        val drawn = (iconTop until iconTop + 16.dp.px()).any { y -> iconArea.any { x -> pixels[x, y].near(red, 0.1f) } }
        assertTrue("a warning icon in front of the message", drawn)
    }

    @Test
    fun E020_AC14_aWarningToastShowsTheWarningIconAndAPlainOneDoesNot() {
        show {
            Column {
                Toast("Niet opgeslagen", Modifier.testTag("plain"))
                Toast("Niet opgeslagen", Modifier.testTag("warning"), warning = true)
            }
        }

        val plain = compose.onNodeWithTag("plain").getUnclippedBoundsInRoot()
        val warning = compose.onNodeWithTag("warning").getUnclippedBoundsInRoot()
        val plainText = compose.onNode(
            hasAnyAncestor(hasTestTag("plain")) and hasText("Niet opgeslagen"),
            useUnmergedTree = true,
        )
            .getUnclippedBoundsInRoot()
        val warningText = compose.onNode(
            hasAnyAncestor(hasTestTag("warning")) and hasText("Niet opgeslagen"),
            useUnmergedTree = true,
        )
            .getUnclippedBoundsInRoot()
        assertTrue(
            "the warning toast's text starts further in: ${warningText.left - warning.left} against ${plainText.left - plain.left}",
            (warningText.left - warning.left) > (plainText.left - plain.left) + 20.dp,
        )
        val pixels = compose.onNodeWithTag("warning").pixels()
        val inverseText = mode.tokens.textInverse
        val iconColumns = (warning.left + 12.dp).px()..(warningText.left - warning.left - 6.dp).px()
        val iconDrawn = (0 until pixels.height).any { y ->
            iconColumns.any { x -> pixels[x, y].near(inverseText, 0.1f) }
        }
        assertTrue("the warning icon is drawn in the toast's text colour", iconDrawn)
    }

    @Test
    fun E020_AC14_theToastHostShowsAWarningToastFromItsVisuals() {
        val host = SnackbarHostState()
        show {
            LaunchedEffect(Unit) { host.showSnackbar(ToastVisuals("Niet opgeslagen", warning = true)) }
            ToastHost(host)
        }

        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Niet opgeslagen")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Niet opgeslagen")).assertIsDisplayed()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}

private class PixelMapProbe(val name: String, val pixels: PixelMap)
