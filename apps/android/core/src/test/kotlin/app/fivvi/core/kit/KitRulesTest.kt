package app.fivvi.core.kit

import androidx.compose.ui.unit.dp
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightTokenColors
import app.fivvi.designtokens.Radius
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// E020 AC14, AC10 (spec #590): the rules of the building blocks that need no screen to be checked. How they look and
// behave on a phone is in the app's androidTest (`app.fivvi.pro.kit`).
class KitRulesTest {
    private val modes = mapOf("light" to LightTokenColors, "dark" to DarkTokenColors)

    @Test
    fun E020_AC14_aCardAndAListGroupUseTheCardRadiusOf28OnAndroid() {
        assertEquals(28.dp, Radius.card)
        assertEquals(28.dp, CardRadius)
    }

    // E020 AC15 (#633): a client's avatar shows the first letters of the first and the last word of the name.
    @Test
    fun E020_AC15_aPersonAvatarShowsTheInitialsOfTheFirstAndTheLastWord() {
        assertEquals("AV", initialsOf("Anna de Vries"))
        assertEquals("MJ", initialsOf("Mark Jansen"))
        assertEquals("S", initialsOf("sarah"))
        assertEquals("ÉB", initialsOf("  éva   van   den  berg "))
        assertEquals("", initialsOf("   "))
    }

    @Test
    fun E020_AC14_aGroupedListRoundsOnlyTheOuterCornersOfItsFirstAndLastRow() {
        assertEquals(
            RowCorners(top = GroupOuterRadius, bottom = GroupOuterRadius),
            groupRowCorners(index = 0, count = 1),
        )
        assertEquals(
            RowCorners(top = GroupOuterRadius, bottom = GroupInnerRadius),
            groupRowCorners(index = 0, count = 3),
        )
        assertEquals(
            RowCorners(top = GroupInnerRadius, bottom = GroupInnerRadius),
            groupRowCorners(index = 1, count = 3),
        )
        assertEquals(
            RowCorners(top = GroupInnerRadius, bottom = GroupOuterRadius),
            groupRowCorners(index = 2, count = 3),
        )
    }

    @Test
    fun E020_AC10_theShapedAvatarIsACookieForAPrivateSessionAndACloverForAGroupClass() {
        assertEquals(AvatarShape.Cookie, SessionType.Private.avatarShape)
        assertEquals(AvatarShape.Clover, SessionType.Group.avatarShape)
    }

    @Test
    fun E020_AC6_theKitKnowsNoOpenGymSessionType() {
        assertEquals(listOf("Private", "Group"), SessionType.entries.map { it.name })
        assertEquals(
            listOf("Neutral", "Success", "Warning", "Danger", "Private", "Group"),
            PillTone.entries.map {
                it.name
            },
        )
    }

    @Test
    fun E020_AC14_aSessionTypeTakesAllItsColoursFromItsOwnTokensInLightAndDark() {
        for ((mode, tokens) in modes) {
            val private = tokens.sessionColors(SessionType.Private)
            assertEquals(mode, tokens.sessionPrivateSolid, private.solid)
            assertEquals(mode, tokens.sessionPrivateBg, private.tint)
            assertEquals(mode, tokens.sessionPrivateText, private.text)
            assertEquals(mode, tokens.sessionPrivateOnSolid, private.onGradient)
            assertEquals(mode, tokens.sessionPrivateGradientTop, private.gradientTop)
            assertEquals(mode, tokens.sessionPrivateGradientBottom, private.gradientBottom)
            val group = tokens.sessionColors(SessionType.Group)
            assertEquals(mode, tokens.sessionGroupBg, group.tint)
            assertEquals(mode, tokens.sessionGroupGradientTop, group.gradientTop)
        }
    }

    @Test
    fun E020_AC14_aStatusPillPutsTheTextTokenOnTheTintTokenOfItsStatus() {
        for ((mode, tokens) in modes) {
            assertEquals(
                mode,
                PillColors(tokens.statusNeutralBg, tokens.statusNeutralFg),
                tokens.pillColors(PillTone.Neutral),
            )
            assertEquals(
                mode,
                PillColors(tokens.statusSuccessBg, tokens.statusSuccessText),
                tokens.pillColors(PillTone.Success),
            )
            assertEquals(
                mode,
                PillColors(tokens.statusWarningBg, tokens.statusWarningText),
                tokens.pillColors(PillTone.Warning),
            )
            assertEquals(
                mode,
                PillColors(tokens.statusDangerBg, tokens.statusDangerText),
                tokens.pillColors(PillTone.Danger),
            )
            assertEquals(
                mode,
                PillColors(tokens.sessionPrivateBg, tokens.sessionPrivateText),
                tokens.pillColors(PillTone.Private),
            )
            assertEquals(
                mode,
                PillColors(tokens.sessionGroupBg, tokens.sessionGroupText),
                tokens.pillColors(PillTone.Group),
            )
        }
    }

    @Test
    fun E020_AC10_noScreenOrKitComponentUsesTheConnectedButtonGroup() {
        // DECISIONS.md section 2: the Expressive connected button group was tried twice and rejected; a single choice is the
        // M3 segmented button.
        val connected = Regex("""\b(ConnectedButtonGroup|ButtonGroup|ToggleButton|ToggleButtonShapes)\b""")
        val sources = listOf("src/main/kotlin", "../app/src/main/kotlin").map(::File).filter { it.isDirectory }
            .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }

        assertTrue("found no sources to read", sources.size > 10)
        assertEquals(emptyList<String>(), sources.filter { connected.containsMatchIn(it.readText()) }.map { it.path })
    }

    @Test
    fun E020_AC10_aSingleChoiceIsOneOfTheSegmentedButtonsItsOptionsAreAtLeastTwo() {
        assertFalse(SegmentedChoiceRules.fits(optionCount = 1))
        assertTrue(SegmentedChoiceRules.fits(optionCount = 2))
        assertTrue(SegmentedChoiceRules.fits(optionCount = 5))
        assertFalse(SegmentedChoiceRules.fits(optionCount = 6))
    }
}
