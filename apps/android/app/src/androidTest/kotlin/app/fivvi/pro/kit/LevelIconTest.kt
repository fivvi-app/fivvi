package app.fivvi.pro.kit

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.LevelIcon
import app.fivvi.core.kit.LevelIconForm
import app.fivvi.core.kit.levelBarsColor
import app.fivvi.pro.localizedString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F067 (spec #587), AC1, AC6, AC13: the level icon of the kit, in light and dark, in nl-NL and en: three bars of rising
// height filled by level, the level as its TalkBack label, and the compact form without *Alle niveaus*.
@RunWith(Parameterized::class)
class LevelIconTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private fun name(level: String) = localizedString(language, R.string.class_level_accessible_name, level)

    private fun word(id: Int) = localizedString(language, id)

    private fun show(level: ClassLevel, form: LevelIconForm) =
        compose.showKit(mode, language) { LevelIcon(level, form, Modifier.testTag(ICON)) }

    // The colour of the bar [index] (0 to 2) of the icon: a pixel in the middle of it, over the canvas.
    private fun barPixel(index: Int): Color {
        val pixels = compose.onNodeWithTag(ICON).pixels()
        val x = ((index * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2) * density).toInt()
        val y = ((BAR_HEIGHTS[index] / 2) * density).toInt().coerceAtLeast(1)
        val bottom = pixels.height - 1
        return pixels[x, bottom - y]
    }

    @Test
    fun F067_AC1_theLevelIsTheTalkBackLabelOfTheIconAndItIsAnImage() {
        show(ClassLevel.ADVANCED, LevelIconForm.Bars)

        compose.onNodeWithTag(ICON).assertContentDescriptionEquals(name(word(R.string.class_level_advanced)))
        val role = compose.onNodeWithTag(ICON).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Role)
        assertEquals(Role.Image, role)
    }

    @Test
    fun F067_AC1_theFullFormHasTheWordInOneElementWithTheBars() {
        show(ClassLevel.BEGINNER, LevelIconForm.Full)

        compose.onNodeWithTag(ICON).assertIsDisplayed()
            .assertContentDescriptionEquals(name(word(R.string.class_level_beginner)))
        // The word is drawn next to the bars, but TalkBack reads only the one label of the icon.
        compose.onNodeWithText(word(R.string.class_level_beginner), useUnmergedTree = true).assertDoesNotExist()
        val width = compose.onNodeWithTag(ICON).fetchSemanticsNode().size.width
        assertTrue("the full form is wider than the bars alone", width > (BAR_TOTAL_WIDTH * density).toInt())
    }

    @Test
    fun F067_AC1_theBarsFormIsTheBarsAlone() {
        show(ClassLevel.BEGINNER, LevelIconForm.Bars)

        val width = compose.onNodeWithTag(ICON).fetchSemanticsNode().size.width
        assertTrue("the bars form is the 13 dp of the bars", width <= (BAR_TOTAL_WIDTH * density).toInt() + 1)
    }

    @Test
    fun F067_AC6_aCompactIconDrawsNothingForAlleNiveausButTheBarsAndFullFormsDo() {
        show(ClassLevel.ALL_LEVELS, LevelIconForm.Compact)
        compose.onNodeWithTag(ICON).assertDoesNotExist()
    }

    @Test
    fun F067_AC1_theBarsAreInTheSecondaryTextColourFilledByLevelAndTheOthersFaded() {
        show(ClassLevel.INTERMEDIATE, LevelIconForm.Bars)

        val ink = mode.tokens.levelBarsColor()
        val canvas = mode.tokens.bgCanvas
        assertTrue("the first bar is filled", barPixel(0).near(ink))
        assertTrue("the second bar is filled", barPixel(1).near(ink))
        val faded = barPixel(2)
        assertFalse("the third bar is not filled in full", faded.near(ink, 0.05f))
        assertFalse("the third bar is not gone", faded.near(canvas, 0.02f))
        // 30 % of the ink over the canvas.
        val expected = ink.copy(alpha = UNFILLED).compositeOver(canvas)
        assertTrue("the third bar is the ink faded to 30 %", faded.near(expected, 0.06f))
    }

    @Test
    fun F067_AC1_alleNiveausFillsAllThreeBarsAtTheSameWeight() {
        show(ClassLevel.ALL_LEVELS, LevelIconForm.Bars)

        val ink = mode.tokens.levelBarsColor()
        (0..2).forEach { assertTrue("bar $it is filled", barPixel(it).near(ink)) }
    }

    // AC13: what is drawn is the one colour that is a declared contrast pair, so the bars are as readable as secondary text.
    @Test
    fun F067_AC13_theBarsAreDrawnInTheTokensSecondaryTextColourNotAnotherOne() {
        show(ClassLevel.ADVANCED, LevelIconForm.Bars)

        assertEquals(mode.tokens.textSecondary, mode.tokens.levelBarsColor())
        assertTrue(barPixel(2).near(mode.tokens.textSecondary))
    }

    private companion object {
        const val ICON = "levelIcon"
        const val BAR_WIDTH = 3f
        const val BAR_GAP = 2f
        const val BAR_TOTAL_WIDTH = 13f
        const val UNFILLED = 0.3f
        val BAR_HEIGHTS = listOf(5f, 8f, 11f)

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
