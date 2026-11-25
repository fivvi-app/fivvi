package app.fivvi.pro.personal

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.then
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.levelBarsColor
import app.fivvi.core.theme.FivviTheme
import app.fivvi.pro.kit.Mode
import app.fivvi.pro.kit.isFilled
import app.fivvi.pro.kit.pixels
import app.fivvi.pro.localizedString
import app.fivvi.pro.textLayout
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F067 (spec #587), the rows of Vandaag and Agenda (AC5, AC6, AC8, AC13): the compact level bars after the class name, in light
// and dark, in nl-NL and en. One element for TalkBack, with *Niveau: {level}* after the class name; a long name wraps and the
// bars stay beside its last word; no icon for *Alle niveaus*, *Geen* or a private session.
@RunWith(Parameterized::class)
class PersonalRowLevelTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val opened = mutableListOf<UUID>()

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun row(title: String, level: ClassLevel?, isGroup: Boolean = true) = PersonalRow(
        id = UUID.nameUUIDFromBytes(title.toByteArray()),
        workspaceId = PersonalFixtures.johns.id,
        workspaceName = "John's Gym",
        isGroup = isGroup,
        title = title,
        startText = "15:00",
        endText = "16:00",
        namesKind = true,
        showsWorkspace = false,
        location = null,
        routeUrl = null,
        pill = null,
        isCancelled = false,
        isPast = false,
        level = listLevel(isGroup, level),
    )

    private fun show(row: PersonalRow, fontScale: Float = 1f, width: Int = 360, prefix: String = TodayTags.PREFIX) =
        compose.setContent {
            DeviceConfigurationOverride(
                DeviceConfigurationOverride.FontScale(fontScale) then
                    DeviceConfigurationOverride.Locales(LocaleList(language.tag)),
            ) {
                FivviTheme(darkTheme = mode.dark) {
                    Card(width) { PersonalRowItem(row, { opened += row.id }, {}, tagPrefix = prefix) }
                }
            }
        }

    @Composable
    private fun Card(width: Int, content: @Composable () -> Unit) {
        Surface(Modifier.width(width.dp), color = mode.tokens.bgSurface) { Box { content() } }
    }

    private fun levelOf(row: PersonalRow, prefix: String = TodayTags.PREFIX): SemanticsNodeInteraction =
        compose.onNodeWithTag("$prefix.level.${row.id}", useUnmergedTree = true)

    private fun titleOf(row: PersonalRow, prefix: String = TodayTags.PREFIX): SemanticsNodeInteraction =
        compose.onNodeWithTag("$prefix.title.${row.id}", useUnmergedTree = true)

    private fun nameOf(row: PersonalRow, prefix: String = TodayTags.PREFIX): String =
        compose.onNodeWithTag("$prefix.row.${row.id}").fetchSemanticsNode().config
            .getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()

    private val dutch get() = language == AppLanguage.DUTCH

    private val advancedName get() = if (dutch) "Niveau: Gevorderd" else "Level: Advanced"

    // AC5: Sarah's Vandaag shows three filled bars after "Reformer Power" with no word, and TalkBack reads the level right
    // after the name, as part of the row's one element.
    @Test
    fun test_F067_AC5_aClassRowShowsTheBarsAfterTheNameWithNoWordAndTalkBackReadsTheLevelAfterTheName() {
        val reformer = row("Reformer Power", ClassLevel.ADVANCED)
        show(reformer)

        levelOf(reformer).assertIsDisplayed()
        compose.onNodeWithText(if (dutch) "Gevorderd" else "Advanced", useUnmergedTree = true).assertDoesNotExist()
        val join = string(R.string.my_day_spoken_join, "Reformer Power", advancedName)
        assertTrue("'${nameOf(reformer)}' has '$join'", nameOf(reformer).contains(join))
        // One element for TalkBack: the bars are no node of their own in the merged tree.
        compose.onNodeWithTag("today.level.${reformer.id}").assertDoesNotExist()
    }

    // AC5: the bars follow the name on its line, after a space that keeps them with its last word.
    @Test
    fun test_F067_AC5_theBarsSitRightAfterTheNameOnItsLine() {
        val reformer = row("Reformer Power", ClassLevel.ADVANCED)
        show(reformer)

        val title = titleOf(reformer).getUnclippedBoundsInRoot()
        val bars = levelOf(reformer).getUnclippedBoundsInRoot()
        val layout = titleOf(reformer).textLayout()
        assertEquals("the name and the bars are on one line", 1, layout.lineCount)
        val nameEnds = title.left + (layout.getBoundingBox("Reformer Power".length - 1).right / density).dp
        assertTrue("the bars start after the name ends: $bars after $nameEnds", bars.left >= nameEnds)
        assertTrue("the bars are in the title's box", bars.right <= title.right + 1.dp)
    }

    // AC6: *Alle niveaus*, *Geen* and a private session show no icon in the row, and the name says no level.
    @Test
    fun test_F067_AC6_aDateWithAlleNiveausShowsNoIconAndNoLevelInItsName() {
        val kracht = row("Kracht", ClassLevel.ALL_LEVELS)
        show(kracht)

        levelOf(kracht).assertDoesNotExist()
        assertFalse(nameOf(kracht).contains(string(R.string.class_level_accessible_name, "").trim()))
    }

    @Test
    fun test_F067_AC6_aClassWithGeenShowsNoIconAndNoLevelInItsName() {
        val boksen = row("Boksen", null)
        show(boksen)

        levelOf(boksen).assertDoesNotExist()
        assertFalse(nameOf(boksen).contains(string(R.string.class_level_accessible_name, "").trim()))
    }

    @Test
    fun test_F067_AC6_aPrivateSessionShowsNoIconEvenForAStrayLevel() {
        val anna = row("Anna de Vries", ClassLevel.BEGINNER, isGroup = false)
        show(anna)

        levelOf(anna).assertDoesNotExist()
        assertFalse(nameOf(anna).contains(string(R.string.class_level_accessible_name, "").trim()))
    }

    // AC5: a long name wraps, nothing is cut off with "…", and the bars stay beside its last word.
    @Test
    fun test_F067_AC5_aLongNameWrapsAndTheBarsStayBesideItsLastWordWithNothingCutOff() {
        val long = row("Reformer Power Pilates voor gevorderde deelnemers met veel ervaring", ClassLevel.ADVANCED)
        show(long, fontScale = 2f, width = 320)

        val layout = titleOf(long).textLayout()
        assertTrue("the name wraps", layout.lineCount > 1)
        assertFalse("the name is cut off", layout.didOverflowHeight)
        val title = titleOf(long).getUnclippedBoundsInRoot()
        val bars = levelOf(long).getUnclippedBoundsInRoot()
        val last = layout.lineCount - 1
        val lastTop = title.top + (layout.getLineTop(last) / density).dp
        val lastBottom = title.top + (layout.getLineBottom(last) / density).dp
        assertTrue(
            "the bars are on the last line: $bars in $lastTop..$lastBottom",
            bars.top >= lastTop - 2.dp && bars.bottom <= lastBottom + 2.dp,
        )
        assertTrue("the bars are not alone on a line", layout.getLineStart(last) < layout.getLineEnd(last))
        levelOf(long).assertIsDisplayed()
    }

    // AC8: nobody can change the level from a row: the bars take no tap, and tapping the row opens it.
    @Test
    fun test_F067_AC8_theBarsHaveNoControlAndTheRowOnlyOpens() {
        val reformer = row("Reformer Power", ClassLevel.ADVANCED)
        show(reformer)

        levelOf(reformer).assertHasNoClickAction()
        compose.onNodeWithTag("today.row.${reformer.id}").performClick()
        assertEquals(listOf(reformer.id), opened)
    }

    // AC13: the bars are drawn in the secondary text colour of the tokens, on the card of the row, in this mode.
    @Test
    fun test_F067_AC13_theBarsAreDrawnInTheSecondaryTextColourOnTheRowsCard() {
        val reformer = row("Reformer Power", ClassLevel.ADVANCED)
        show(reformer)

        val pixels = levelOf(reformer).pixels()
        val ink = mode.tokens.levelBarsColor()
        var inked = 0
        for (y in 0 until pixels.height) for (x in 0 until pixels.width) if (pixels.isFilled(x, y, ink, 0.08f)) inked++
        assertTrue("the three bars are drawn in the secondary text colour ($inked pixels)", inked > 20)
    }

    private val density get() = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        .targetContext.resources.displayMetrics.density

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
