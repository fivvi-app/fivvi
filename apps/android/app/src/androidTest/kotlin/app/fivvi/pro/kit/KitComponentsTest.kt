package app.fivvi.pro.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.Shape
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
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.CardRadius
import app.fivvi.core.kit.FieldErrorLine
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
import app.fivvi.core.theme.FivviFonts
import app.fivvi.core.theme.FivviTypography
import app.fivvi.pro.localizedString
import app.fivvi.pro.textLayout
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// The ink of a line of Google Sans Flex: cap height above its baseline, descenders below it, in em.
private const val CAP_HEIGHT = 0.72f
private const val DESCENT = 0.22f

// The radius of the two ends of a segmented choice (SegmentedChoice.kt). The test that reads the pixels of a wrapped row
// pins the radius the component really draws to this; the test that lays the ink over the outline uses it for the outline.
private val SegmentedEndRadius = 20.dp

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
        // The rows are `ListRow`s that fill separate surfaces, so the gap between two rows is the gap between surfaces.
        for ((above, below) in rows.zipWithNext()) {
            val gap = below.top - above.bottom
            assertTrue("rows are $gap apart, not 2 dp", abs((gap - GroupGap).value) < 0.5f)
        }
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

    // The accent fill (#E6164A) is 4.11:1 on the canvas, below the 4.5:1 of text; the token for text in the accent is
    // accentText, so the label of a text pill is drawn in it, never in the fill.
    @Test
    fun E020_AC14_theLabelOfATextPillIsInTheAccentTextColourNotTheFill() {
        show { PillButton("Text", onClick = {}, Modifier.testTag("text"), style = PillButtonStyle.Text) }

        val pixels = compose.onNodeWithTag("text").pixels()
        var text = 0
        var fill = 0
        for (y in 0 until pixels.height) {
            for (x in 0 until pixels.width) {
                if (pixels.isFilled(x, y, tokens.accentText, 0.02f)) text++
                if (pixels.isFilled(x, y, tokens.accentFill, 0.02f)) fill++
            }
        }
        assertTrue("the label is in the accent text colour", text > 0)
        assertEquals("no pixel of the label is in the fill colour", 0, fill)
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
            // Tabular digits, but the words stay in the plain face (the round axis is for numbers on their own).
            val style = pill.textLayout().layoutInput.style
            assertEquals("$tone: tabular", "tnum", style.fontFeatureSettings)
            assertEquals("$tone: plain face", FivviFonts.GoogleSansFlex, style.fontFamily)
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
        // The shapes themselves: neither is a square (the corner is empty) nor the plain circle that a rounded box would
        // give. Away from the letters, a circle and the avatar disagree where the cookie's scallops and the clover's
        // notches are; a plain circle would disagree nowhere.
        assertFalse(cookie.isFilled(0, 0, cookieFill))
        assertFalse(clover.isFilled(0, 0, cloverFill))
        val cookieNotCircle = cookie.circleDisagreement(cookieFill)
        val cloverNotCircle = clover.circleDisagreement(cloverFill)
        assertTrue("the cookie differs from a circle by $cookieNotCircle", cookieNotCircle > 0.015f)
        assertTrue("the clover differs from a circle by $cloverNotCircle", cloverNotCircle > 0.05f)
        // A clover has four leaves, here with their tips on the diagonals and the notches on the axes: from the middle
        // outwards, the fill reaches less far along an axis than along a diagonal (a circle reaches as far in every
        // direction).
        val axis = clover.reach(0f, -1f, cloverFill)
        val diagonal = clover.reach(0.7071f, 0.7071f, cloverFill)
        assertTrue("the clover reaches $axis along an axis and $diagonal on its diagonal", axis < diagonal * 0.9f)
        assertNotEquals("the shapes differ", cookieNotCircle, cloverNotCircle)
        compose.onNode(hasAnyAncestor(hasTestTag("private-row")) and hasText("08:30")).assertIsDisplayed()
        compose.onNode(hasAnyAncestor(hasTestTag("private-row")) and hasText("Anna de Vries")).assertIsDisplayed()
        compose.onNode(hasAnyAncestor(hasTestTag("group-row")) and hasText("09:30")).assertIsDisplayed()
        // The time is the prototype's: 14 sp, semibold, tabular, in the round face.
        val timeStyle = compose.onNode(hasText("08:30")).textLayout().layoutInput.style
        assertEquals(FivviTypography.bodyMedium.fontSize, timeStyle.fontSize)
        assertEquals(FontWeight.SemiBold, timeStyle.fontWeight)
        assertEquals("tnum", timeStyle.fontFeatureSettings)
        assertEquals(FivviFonts.GoogleSansFlexRounded, timeStyle.fontFamily)
        // The time is on the right of the title.
        val title = compose.onNode(hasText("Anna de Vries")).getUnclippedBoundsInRoot()
        val time = compose.onNode(hasText("08:30")).getUnclippedBoundsInRoot()
        assertTrue("the time ($time) is right of the title ($title)", time.left >= title.right)
    }

    // The pixels in front of the label that differ from the segment's fill: the check, when there is one.
    private fun inkInFrontOfTheLabel(tag: String, text: String): Int {
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

    // At 200% on a small phone: the selected segment keeps its check (colour is not the only sign of the selection),
    // and every label is whole inside its own segment, with no tolerance: nothing reaches past the segment's edge. A label
    // that can't fit on one line wraps; [oneLine] is for the ones that can.
    private fun assertSegmentsAreWholeAt200Percent(width: Dp, labels: List<String>, selected: Int, oneLine: Boolean) {
        compose.showKit(mode, language, fontScale = 2f, width = width) {
            SegmentedChoice(
                options = labels.mapIndexed { index, text -> SegmentedOption(index, text, "choice.$index") },
                selected = selected,
                onSelect = {},
            )
        }

        // The segments are as high as each other (a label that wraps doesn't leave its neighbour short) and the row is
        // not stretched to the height of the screen.
        val heights = labels.indices.map {
            compose.onNodeWithTag("choice.$it").getUnclippedBoundsInRoot().let { box -> box.bottom - box.top }
        }
        assertTrue("segment heights differ: $heights", heights.all { abs((it - heights.first()).value) < 0.5f })
        assertTrue("the row is ${heights.first()} high", heights.first() < 120.dp)

        labels.forEachIndexed { index, text ->
            val tag = "choice.$index"
            val segmentNode = compose.onNodeWithTag(tag)
            if (index == selected) segmentNode.assertIsSelected() else segmentNode.assertIsNotSelected()
            val node = compose.onNode(hasAnyAncestor(hasTestTag(tag)) and hasText(text), useUnmergedTree = true)
            val layout = node.textLayout()
            assertEquals("$text shows in full", text, layout.layoutInput.text.text)
            assertFalse("$text loses lines", layout.didOverflowHeight)
            if (oneLine) assertEquals("$text stays on one line", 1, layout.lineCount)
            val segment = segmentNode.getUnclippedBoundsInRoot()
            val shown = node.getUnclippedBoundsInRoot()
            assertTrue(
                "$text's right edge ${shown.right} is past its segment's ${segment.right}",
                shown.right <= segment.right,
            )
            assertTrue(
                "$text's left edge ${shown.left} is before its segment's ${segment.left}",
                shown.left >= segment.left,
            )
            assertTrue(
                "$text's box $shown is not inside its segment $segment",
                shown.top >= segment.top && shown.bottom <= segment.bottom,
            )
            // The check is in front of the selected label and inside the segment. (Whether the others have none is the
            // normal-scale test's: here a label can start so near its segment's outline that the outline is in front of it.)
            if (index == selected) {
                val ink = inkInFrontOfTheLabel(tag, text)
                assertTrue("$text has a check in front of it ($ink pixels)", ink > 20)
                // The check (18 dp) and its gap (4 dp at this scale) are inside the segment, before the label.
                assertTrue("the check starts inside the segment", shown.left - segment.left >= 22.dp)
            }
        }
    }

    @Test
    fun E020_AC10_at200PercentOnA360dpPhoneTheLabelsAreWholeOnOneLineBesideTheCheck() =
        assertSegmentsAreWholeAt200Percent(
            width = 328.dp,
            labels = listOf(label(R.string.settings_language_option_nl), label(R.string.settings_language_option_en)),
            selected = 0,
            oneLine = true,
        )

    @Test
    fun E020_AC10_at200PercentOnA320dpScreenNoLabelIsCutOff() = assertSegmentsAreWholeAt200Percent(
        width = 320.dp,
        labels = listOf(label(R.string.settings_language_option_nl), label(R.string.settings_language_option_en)),
        selected = 0,
        oneLine = false,
    )

    @Test
    fun E020_AC10_at200PercentWithThreeOptionsTheSelectedLabelIsWholeInsideItsSegment() =
        assertSegmentsAreWholeAt200Percent(
            width = 328.dp,
            // Words of attendance and appearance that the catalog doesn't have yet: sample labels of the long kind.
            labels = listOf("Aanwezig", "Afwezig", "Donker"),
            selected = 1,
            oneLine = false,
        )

    // A segment clips what it shows to its outline, and the outer corners of the first and last segment are curves.
    // `getUnclippedBoundsInRoot` ignores that clip, so the test above can't see a label the curve cuts: this one lays the
    // ink of each line of a wrapped label (cap height above the baseline to the descender below it) over the outline the
    // segment really has (the end radius that the next test reads off the pixels), and asks that the four corners of every
    // line are inside it.
    @Test
    fun E020_AC10_at200PercentAWrappedLabelInTheFirstAndTheLastSegmentIsClearOfThePillsCurve() {
        // Sample labels of the long kind that wrap in a third of the row; the selected (checked) one is the middle.
        val labels = listOf("Doordeweeks lunch", "Midden", "Weekendavond")
        val shapes = mutableListOf<Shape>()
        compose.showKit(mode, language, fontScale = 2f, width = 328.dp) {
            val count = labels.size
            shapes.clear()
            labels.indices.forEach {
                shapes += SegmentedButtonDefaults.itemShape(it, count, RoundedCornerShape(SegmentedEndRadius))
            }
            SegmentedChoice(
                options = labels.mapIndexed { index, text -> SegmentedOption(index, text, "choice.$index") },
                selected = 1,
                onSelect = {},
            )
        }

        for (index in listOf(0, labels.lastIndex)) {
            val tag = "choice.$index"
            val segment = compose.onNodeWithTag(tag).fetchSemanticsNode()
            val isItsLabel = hasAnyAncestor(hasTestTag(tag)) and hasText(labels[index])
            val node = compose.onNode(isItsLabel, useUnmergedTree = true)
            val textNode = node.fetchSemanticsNode()
            val layout = node.textLayout()
            assertTrue("${labels[index]} wraps", layout.lineCount > 1)
            val size = Size(segment.size.width.toFloat(), segment.size.height.toFloat())
            val outline = shapes[index].createOutline(size, LayoutDirection.Ltr, Density(density)) as Outline.Rounded
            val fontSize = with(layout.layoutInput.density) { layout.layoutInput.style.fontSize.toPx() }
            val dx = textNode.positionInRoot.x - segment.positionInRoot.x
            val dy = textNode.positionInRoot.y - segment.positionInRoot.y
            for (line in 0 until layout.lineCount) {
                val top = dy + layout.getLineBaseline(line) - CAP_HEIGHT * fontSize
                val bottom = dy + layout.getLineBaseline(line) + DESCENT * fontSize
                val left = dx + layout.getLineLeft(line)
                val right = dx + layout.getLineRight(line)
                val corners = listOf(left to top, right to top, left to bottom, right to bottom)
                for ((x, y) in corners) {
                    val corner = Offset(x, y)
                    assertTrue(
                        "${labels[index]}, line $line: the ink corner $corner is outside the outline of its segment " +
                            "${outline.roundRect}",
                        outline.roundRect.contains(corner),
                    )
                }
            }
        }
    }

    // What the segmented choice draws, read off its pixels: a wrapped row is tall (about 110 dp at 200%), and Material
    // rounds an end by half the segment's height, 55 dp, which would cut a label's corner. The ends are 20 dp whatever the
    // height: the outline is on the outer edge 30 dp down (outside a 55 dp curve, which has left the edge by 6 dp there),
    // and on the diagonal from the corner the outline starts where a 20 dp curve is, 5.9 dp in each way (22.8 dp for 55 dp).
    @Test
    fun E020_AC10_at200PercentTheEndsOfAWrappedSegmentedChoiceAreCurvesOf20dpWhateverTheHeight() {
        val labels = listOf("Doordeweeks lunch", "Midden", "Weekendavond")
        compose.showKit(mode, language, fontScale = 2f, width = 328.dp) {
            SegmentedChoice(
                options = labels.mapIndexed { index, text -> SegmentedOption(index, text, "choice.$index") },
                selected = 1,
                onSelect = {},
            )
        }

        for (index in listOf(0, labels.lastIndex)) {
            val last = index == labels.lastIndex
            val segment = compose.onNodeWithTag("choice.$index").getUnclippedBoundsInRoot()
            val height = segment.bottom - segment.top
            assertTrue("segment $index is $height high, a wrapped one", height > 90.dp)
            val pixels = compose.onNodeWithTag("choice.$index").pixels()
            // The segment's outer edge, mirrored for the last one: x counted from the outer edge in.
            val outerX = { fromEdge: Int -> if (last) pixels.width - 1 - fromEdge else fromEdge }
            val canvas = mode.tokens.bgCanvas
            val outline = mode.tokens.borderControl
            assertTrue("segment $index: the corner pixel is the canvas", pixels.isFilled(outerX(0), 0, canvas))

            // 30 dp down, on the straight part of a 20 dp end, the outline is on the outer edge.
            val y30 = 30.dp.px()
            val edge = (0 until 3.dp.px()).firstOrNull { pixels[outerX(it), y30].near(outline, 0.1f) }
            assertNotNull("segment $index: no outline on the outer edge 30 dp down (a curve of half the height)", edge)

            // From the corner along the diagonal, the first pixel that is not the canvas is the outline.
            val onTheOutline = (0 until 30.dp.px()).first { !pixels[outerX(it), it].near(canvas, 0.08f) }
            val reach = onTheOutline / density
            val expected = SegmentedEndRadius.value * (1 - 1 / kotlin.math.sqrt(2f))
            assertTrue(
                "segment $index: the outline starts $reach dp in on the diagonal, a 20 dp curve $expected dp",
                abs(reach - expected) <= 1f,
            )
        }
    }

    // The outer side of the first (unselected) and the last segment keeps 4 dp clear above 150% font scale: a label whose
    // line nearly fills the box is the one that shows it. Without the padding it is centred with less than 4 dp to the edge.
    private fun assertOuterLabelsKeepTheirPadding(labels: List<String>, selected: Int) {
        compose.showKit(mode, language, fontScale = 2f, width = 328.dp) {
            SegmentedChoice(
                options = labels.mapIndexed { index, text -> SegmentedOption(index, text, "choice.$index") },
                selected = selected,
                onSelect = {},
            )
        }

        fun text(index: Int) = compose.onNode(
            hasAnyAncestor(hasTestTag("choice.$index")) and hasText(labels[index]),
            useUnmergedTree = true,
        )
        val last = labels.lastIndex
        if (selected != 0) {
            val first = compose.onNodeWithTag("choice.0").getUnclippedBoundsInRoot()
            val gap = text(0).getUnclippedBoundsInRoot().left - first.left
            assertTrue("${labels[0]} is $gap from the first segment's outer edge", gap >= 4.dp)
            assertEquals("${labels[0]} on one line", 1, text(0).textLayout().lineCount)
        }
        val gap = compose.onNodeWithTag("choice.$last").getUnclippedBoundsInRoot().right -
            text(last).getUnclippedBoundsInRoot().right
        assertTrue("${labels[last]} is $gap from the last segment's outer edge", gap >= 4.dp)
        assertEquals("${labels[last]} on one line", 1, text(last).textLayout().lineCount)
    }

    // The labels are sample words of 104 dp (Morning) and 81 dp (Smalle) at 200% in a segment of 109 dp: the line nearly
    // fills the box, with the check (22 dp) and without it.
    @Test
    fun E020_AC10_at200PercentTheOuterLabelsKeep4dpFromTheEdgeWithTheFirstSegmentSelected() =
        assertOuterLabelsKeepTheirPadding(listOf("Smalle", "Midden", "Morning"), selected = 0)

    @Test
    fun E020_AC10_at200PercentTheOuterLabelsKeep4dpFromTheEdgeWithTheMiddleSegmentSelected() =
        assertOuterLabelsKeepTheirPadding(listOf("Morning", "Midden", "Morning"), selected = 1)

    @Test
    fun E020_AC10_at200PercentTheOuterLabelsKeep4dpFromTheEdgeWithTheLastSegmentSelected() =
        assertOuterLabelsKeepTheirPadding(listOf("Morning", "Midden", "Smalle"), selected = 2)

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

    // #632: a screen that tags the message, or keeps it out of the field's own text, draws the message itself.
    @Test
    fun E020_AC14_aFieldCanLeaveItsMessageToTheScreenAndTheHelpShowsUnderItWithoutOne() {
        val message = label(R.string.clients_add_dialog_errors_email_required)
        val help = label(R.string.sign_in_code_help)
        show {
            Column {
                FivviField(
                    "x@example.com",
                    {},
                    label(R.string.clients_add_dialog_email_label),
                    Modifier.testTag("outside"),
                    error = message,
                    showsErrorMessage = false,
                )
                FieldErrorLine(message, Modifier.testTag("line"))
                FivviField("", {}, label(R.string.sign_in_code_label), Modifier.testTag("helped"), help = help)
            }
        }

        // The field is in error and read as such, but its own text is the label only; the line is the tagged message.
        compose.onNodeWithTag("outside").assert(SemanticsMatcher.expectValue(SemanticsProperties.Error, message))
        compose.onNodeWithTag("outside")
            .assertTextEquals(label(R.string.clients_add_dialog_email_label), "x@example.com")
        compose.onNodeWithTag("line").assertTextEquals(message)
        compose.onNodeWithTag("helped").assertTextContains(help)
    }

    @Test
    fun E020_AC14_aListRowShowsAChevronOnlyWhenAskedTo() {
        show {
            InsetGroupedList {
                row { ListRow("Klanten", Modifier.testTag("with"), onClick = {}, chevron = true) }
                row { ListRow("Profiel", Modifier.testTag("without"), onClick = {}) }
            }
        }

        val drawn = { tag: String ->
            val pixels = compose.onNodeWithTag(tag).pixels()
            val decorative = mode.tokens.fillDecorative
            val columns = (pixels.width - 40.dp.px()) until (pixels.width - 8.dp.px())
            (0 until pixels.height).any { y -> columns.any { x -> pixels[x, y].near(decorative, 0.05f) } }
        }
        assertTrue("the row with a chevron draws it at the end", drawn("with"))
        assertFalse("the other has none", drawn("without"))
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
    fun E020_AC14_theToastHostShowsAWarningToastFromItsVisualsWithTheIcon() {
        val warning = SnackbarHostState()
        val plain = SnackbarHostState()
        show {
            Column {
                LaunchedEffect(Unit) { warning.showSnackbar(ToastVisuals("Niet opgeslagen", warning = true)) }
                LaunchedEffect(Unit) { plain.showSnackbar(ToastVisuals("Opgeslagen", warning = false)) }
                ToastHost(warning, Modifier.testTag("warning-host"))
                ToastHost(plain, Modifier.testTag("plain-host"))
            }
        }

        compose.waitUntil(5_000) {
            compose.onAllNodes(hasText("Niet opgeslagen")).fetchSemanticsNodes().isNotEmpty() &&
                compose.onAllNodes(hasText("Opgeslagen")).fetchSemanticsNodes().isNotEmpty()
        }
        // The warning toast's text starts further in, behind the warning icon, and only the visuals tell them apart.
        val warningIndent = compose.onNode(hasText("Niet opgeslagen")).getUnclippedBoundsInRoot().left -
            compose.onNodeWithTag("warning-host").getUnclippedBoundsInRoot().left
        val plainIndent = compose.onNode(hasText("Opgeslagen")).getUnclippedBoundsInRoot().left -
            compose.onNodeWithTag("plain-host").getUnclippedBoundsInRoot().left
        assertTrue("indents: warning $warningIndent, plain $plainIndent", warningIndent > plainIndent + 20.dp)
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
