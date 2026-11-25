package app.fivvi.core.kit

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import app.fivvi.api.models.ClassLevel
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightTokenColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// F067 (spec #587): the rules of the level icon of the kit that need no screen to be checked. How it looks and what
// TalkBack reads is in the app's androidTest (`app.fivvi.pro.kit`, `app.fivvi.pro.classes`, `app.fivvi.pro.personal`).
class LevelIconRulesTest {
    private val modes = mapOf("light" to LightTokenColors, "dark" to DarkTokenColors)

    @Test
    fun F067_AC1_theBarsAreFilledByLevelAndAlleNiveausFillsAllThree() {
        assertEquals(1, ClassLevel.BEGINNER.filledBars)
        assertEquals(2, ClassLevel.INTERMEDIATE.filledBars)
        assertEquals(3, ClassLevel.ADVANCED.filledBars)
        assertEquals(3, ClassLevel.ALL_LEVELS.filledBars)
    }

    @Test
    fun F067_AC6_aRowShowsNoIconForAlleNiveausButTheOtherFormsDo() {
        assertFalse(levelIconShown(ClassLevel.ALL_LEVELS, LevelIconForm.Compact))
        assertTrue(levelIconShown(ClassLevel.ALL_LEVELS, LevelIconForm.Full))
        assertTrue(levelIconShown(ClassLevel.ALL_LEVELS, LevelIconForm.Bars))
        for (level in listOf(ClassLevel.BEGINNER, ClassLevel.INTERMEDIATE, ClassLevel.ADVANCED)) {
            for (form in LevelIconForm.entries) assertTrue("$level $form", levelIconShown(level, form))
        }
        assertTrue(ClassLevel.ADVANCED.showsInList)
        assertFalse(ClassLevel.ALL_LEVELS.showsInList)
    }

    @Test
    fun F067_AC1_theFieldListsAlleNiveausBeginnerGemiddeldGevorderdAndGeenIsNull() {
        assertEquals(
            listOf(ClassLevel.ALL_LEVELS, ClassLevel.BEGINNER, ClassLevel.INTERMEDIATE, ClassLevel.ADVANCED),
            classLevelFieldOrder,
        )
        assertEquals(app.fivvi.core.R.string.class_level_none, (null as ClassLevel?).wordRes)
        assertEquals(app.fivvi.core.R.string.class_level_advanced, ClassLevel.ADVANCED.wordRes)
    }

    @Test
    fun F067_AC1_theBarsRiseFrom5To8To11WithTheUnfilledOnesFaded() {
        assertEquals(listOf(5f, 8f, 11f), LevelBarsMetrics.heights)
        assertEquals(3f, LevelBarsMetrics.BAR_WIDTH)
        assertEquals(2f, LevelBarsMetrics.BAR_GAP)
        assertEquals(0.3f, LevelBarsMetrics.UNFILLED_ALPHA)
        // Three bars and two gaps: 13 wide, as high as the tallest, 11.
        assertEquals(13f, LevelBarsMetrics.totalWidth)
        assertEquals(11f, LevelBarsMetrics.totalHeight)
    }

    @Test
    fun F067_AC1_theBarsStandOnOneLineAndStayInsideTheirBox() {
        val bars = LevelBarsMetrics.layout(boxWidth = 26f, boxHeight = 22f)

        assertEquals(3, bars.size)
        // Twice as large: widths 6, gaps 4, heights 10, 16 and 22, all ending at the bottom.
        assertEquals(listOf(0f, 10f, 20f), bars.map { it.left })
        assertEquals(listOf(6f, 6f, 6f), bars.map { it.width })
        assertEquals(listOf(10f, 16f, 22f), bars.map { it.height })
        assertEquals(listOf(22f, 22f, 22f), bars.map { it.top + it.height })
    }

    // The compact bars of a row are part of the text after the class name, behind a non-breaking space, so a long name wraps
    // and the bars stay with its last word (the rows ticket, #770).
    @Test
    fun F067_AC5_aRowTextHasTheBarsRightAfterTheNameBehindANonBreakingSpace() {
        val text = levelRowText("Reformer Power", ClassLevel.ADVANCED, "Niveau: Gevorderd")

        assertEquals("Reformer Power\u00A0Niveau: Gevorderd", text.text)
        assertEquals(1, levelRowInlineContent(ClassLevel.ADVANCED, "tag").size)
    }

    @Test
    fun F067_AC6_aRowTextIsTheNameAloneForAlleNiveausAndGeen() {
        assertEquals("Kracht", levelRowText("Kracht", ClassLevel.ALL_LEVELS, "Niveau: Alle niveaus").text)
        assertEquals("Kracht", levelRowText("Kracht", null, "").text)
        assertTrue(levelRowInlineContent(ClassLevel.ALL_LEVELS, "tag").isEmpty())
        assertTrue(levelRowInlineContent(null, "tag").isEmpty())
    }

    // AC13: the filled bars take the secondary text colour of the tokens, a declared native-secondary-text pair, which
    // packages/design-tokens checks too (light 3:1, dark 4.5:1): here the bars' own colour on the surfaces they sit on.
    @Test
    fun F067_AC13_theFilledBarsMeet3To1OnTheCanvasTheCardTheSheetAndTheQuietFillInLightAndDark() {
        for ((mode, tokens) in modes) {
            assertEquals(mode, tokens.textSecondary, tokens.levelBarsColor())
            val surfaces = mapOf(
                "canvas" to tokens.bgCanvas,
                "card" to tokens.bgSurface,
                "sheet" to tokens.bgRaised,
                "quiet fill" to tokens.bgSubtle,
            )
            for ((name, surface) in surfaces) {
                val ratio = contrast(tokens.levelBarsColor(), surface)
                assertTrue("$mode: the bars on the $name are $ratio:1", ratio >= MIN_NON_TEXT_CONTRAST)
            }
        }
    }

    // WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), the lighter first.
    private fun contrast(a: Color, b: Color): Double {
        val high = maxOf(a.luminance(), b.luminance()).toDouble()
        val low = minOf(a.luminance(), b.luminance()).toDouble()
        return (high + 0.05) / (low + 0.05)
    }

    private companion object {
        const val MIN_NON_TEXT_CONTRAST = 3.0
    }
}
