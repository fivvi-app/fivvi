package app.fivvi.pro.classes

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.SessionSeries
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.showAtLargestFontScale
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of DECISIONS.md §3), in both languages at the largest font scale:
// Mobility with Sarah at John's Gym on Thursday 24 September 2026, 18:00-19:00 (Europe/Amsterdam).
@RunWith(Parameterized::class)
class ClassDateScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val sarah = trainerOf("Sarah")
    private val john = trainerOf("John")
    private var calls = 0
    private var current by mutableStateOf(state())

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private val mobility = groupClassOf(
        "Mobility",
        nameEn = "Mobility flow",
        descriptionNl = "Rustig bewegen en rekken.",
        descriptionEn = "Gentle moving and stretching.",
        trainer = sarah,
    )

    private fun state(
        groupClass: GroupClass? = null,
        canManage: Boolean = true,
        trainerIsMe: Boolean = true,
        trainer: app.fivvi.api.models.Trainer? = sarah,
        booked: Int = 0,
        added: Int? = null,
        series: SessionSeries? = null,
        level: ClassLevel? = null,
    ): ClassDateState {
        val shown = groupClass ?: groupClassOf("Mobility", "Mobility flow", "Rustig.", "Gentle.", sarah)
        return ClassDateState(
            myTeamMemberId = if (trainerIsMe) sarah.id else UUID.randomUUID(),
            canManage = canManage,
            added = added,
            load = ClassDateLoad.Loaded,
            session = classDateOf(UUID.randomUUID(), shown, trainer, booked = booked, series = series, level = level),
            groupClass = shown,
        )
    }

    private fun show(shown: ClassDateState) {
        current = shown
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            ClassDateScreen(
                current,
                "John's Gym",
                ClassDateActions(
                    onBack = {},
                    onRetry = {},
                    onToggleDescription = { current = current.copy(descriptionOpen = !current.descriptionOpen) },
                    onEdit = {
                        calls++
                        current = current.copy(manageOnWeb = true)
                    },
                ),
            )
        }
    }

    private val dutch get() = language == AppLanguage.DUTCH

    // AC3: the name in the viewer's language, the date and the time, the location and the places.
    @Test
    fun test_F021_AC3_theDateShowsTheNameTheTimeTheLocationTheTrainerAndThePlaces() {
        show(state(mobility, trainerIsMe = false, booked = 3))

        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals(if (dutch) "Mobility" else "Mobility flow")
        val day = if (dutch) "donderdag 24 september 2026" else "Thursday 24 September 2026"
        compose.onNodeWithTag(ClassDateTags.WHEN).assertTextEquals("$day, 18:00–19:00")
        compose.onNodeWithTag(ClassDateTags.LOCATION).assertTextEquals("John's Gym")
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals("Sarah")
        compose.onNodeWithTag(ClassDateTags.BOOKED).assertTextEquals(
            if (dutch) "3/12 geboekt · 9 plekken vrij" else "3/12 booked · 9 spots free",
        )
        compose.onNodeWithTag(ClassDateTags.NO_BOOKINGS).assertDoesNotExist()
    }

    @Test
    fun test_F021_AC3_aDateWithoutBookingsSaysNogGeenBoekingenAndTheViewerIsJij() {
        show(state(mobility))

        compose.onNodeWithTag(ClassDateTags.BOOKED).assertTextEquals(
            if (dutch) "0/12 geboekt · 12 plekken vrij" else "0/12 booked · 12 spots free",
        )
        compose.onNodeWithTag(ClassDateTags.NO_BOOKINGS).assertTextEquals(string(R.string.classes_date_no_bookings))
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals(string(R.string.sessions_page_you))
    }

    // AC5: Trainer nodig shows on TD-03, in the workspace's word for the people who teach.
    @Test
    fun test_F021_AC5_aDateWithoutATrainerShowsTrainerNodig() {
        show(state(mobility, trainerIsMe = false, trainer = null))

        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals(
            string(R.string.classes_trainer_needed, string(R.string.trainer_word_trainer_word_cap)),
        )
    }

    @Test
    fun test_F021_AC6_aDateJustAddedSaysGroepslesToegevoegd() {
        show(state(mobility, added = 1))

        compose.onNodeWithTag(ClassDateTags.ADDED).assertTextEquals(string(R.string.classes_schedule_saved))
    }

    // F022 AC6: a new weekly class opens with "12 groepslessen toegevoegd".
    @Test
    fun test_F022_AC6_aNewWeeklyClassOpensWithTwelveGroepslessenToegevoegd() {
        show(state(mobility, added = 12))

        compose.onNodeWithTag(ClassDateTags.ADDED).assertTextEquals(
            if (dutch) "12 groepslessen toegevoegd" else "12 group classes added",
        )
    }

    // F022 AC6: a date in a weekly series says Onderdeel van: {class}, elke {weekday} {time}, for the Owner and a Trainer.
    @Test
    fun test_F022_AC6_aDateInASeriesSaysOnderdeelVanTheClassEveryWeekdayAndTime() {
        val series = SessionSeries(UUID.randomUUID(), SessionSeries.Weekday.TH, "18:00", "2026-09-24", emptyList())
        show(state(mobility, series = series))

        compose.onNodeWithTag(ClassDateTags.SERIES).assertTextEquals(
            if (dutch) {
                "Onderdeel van: Mobility, elke donderdag 18:00"
            } else {
                "Part of: Mobility flow, every Thursday 18:00"
            },
        )
    }

    @Test
    fun test_F022_AC6_aTrainerReadsTheSeriesLineToo() {
        val series = SessionSeries(UUID.randomUUID(), SessionSeries.Weekday.TH, "18:00", "2026-09-24", emptyList())
        show(state(mobility, canManage = false, series = series))

        compose.onNodeWithTag(ClassDateTags.SERIES).assertIsDisplayed()
    }

    @Test
    fun test_F022_AC6_aDateOnItsOwnHasNoSeriesLine() {
        show(state(mobility))

        compose.onNodeWithTag(ClassDateTags.SERIES).assertDoesNotExist()
    }

    @Test
    fun test_F021_AC6_aDateOpenedLaterSaysNothingOfItBeingAdded() {
        show(state(mobility))

        compose.onNodeWithTag(ClassDateTags.ADDED).assertDoesNotExist()
    }

    // Design: the description in the viewer's language, with Meer / Minder.
    @Test
    fun test_F021_design_theDescriptionIsInTheAppsLanguageWithMeerAndMinder() {
        show(state(mobility))

        compose.onNodeWithTag(ClassDateTags.DESCRIPTION).assertTextEquals(
            if (dutch) "Rustig bewegen en rekken." else "Gentle moving and stretching.",
        )
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_MARK).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE)
            .assertTextEquals(string(R.string.classes_app_description_more))

        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE).performClick()

        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE)
            .assertTextEquals(string(R.string.classes_app_description_less))
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE).performClick()
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE)
            .assertTextEquals(string(R.string.classes_app_description_more))
    }

    @Test
    fun test_F021_design_aDutchOnlyDescriptionIsShownToAnEnglishViewerMarkedAsDutch() {
        show(state(groupClassOf("Yoga", descriptionNl = "Rustig bewegen.", trainer = sarah)))

        compose.onNodeWithTag(ClassDateTags.DESCRIPTION).assertTextEquals("Rustig bewegen.")
        if (dutch) {
            compose.onNodeWithTag(ClassDateTags.DESCRIPTION_MARK).assertDoesNotExist()
        } else {
            compose.onNodeWithTag(ClassDateTags.DESCRIPTION_MARK)
                .assertTextEquals(string(R.string.classes_app_description_in_dutch))
        }
    }

    @Test
    fun test_F021_design_aClassWithoutADescriptionShowsNoDescriptionAndNoToggle() {
        show(state(groupClassOf("Yoga", trainer = sarah)))

        compose.onNodeWithTag(ClassDateTags.TITLE).assertIsDisplayed()
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE).assertDoesNotExist()
    }

    // Design: the Owner's ⋯ has Les wijzigen, which says the class is managed on the web, with the footnote.
    @Test
    fun test_F021_design_theOwnersMenuHasLesWijzigenWhichSaysToUseTheWeb() {
        show(state(mobility))

        compose.onNodeWithTag(ClassDateTags.OWNER_NOTE).assertTextEquals(
            string(R.string.classes_app_owner_note, string(R.string.trainer_word_trainer_words)),
        )
        compose.onNodeWithTag(ClassDateTags.MANAGE_ON_WEB).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        // The menu is a window of its own, outside the language this test overrides: ClassFlowTest reads its text.
        compose.onNodeWithTag(ClassDateTags.EDIT).assertIsDisplayed()

        compose.onNodeWithTag(ClassDateTags.EDIT).performClick()

        assertEquals(1, calls)
        compose.onNodeWithTag(ClassDateTags.MANAGE_ON_WEB).assertTextEquals(string(R.string.classes_app_manage_on_web))
    }

    // Design and AC7: a Trainer who is not substituting has no ⋯ menu and no footnote, but can read the date.
    @Test
    fun test_F021_AC7_aTrainerHasNoMenuAndNoOwnerNoteButReadsTheDate() {
        show(state(mobility, canManage = false))

        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals(if (dutch) "Mobility" else "Mobility flow")
        compose.onNodeWithTag(ClassDateTags.LOCATION).assertTextEquals("John's Gym")
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.OWNER_NOTE).assertDoesNotExist()
    }

    // F067 AC1, AC7: the eyebrow reads "Groepsles · Gevorderd" with the icon, the same for each of the four levels.
    @Test
    fun test_F067_AC7_theEyebrowHasTheTypeTheLevelWordAndTheIconForEachLevel() {
        val words = mapOf(
            ClassLevel.ALL_LEVELS to (if (dutch) "Alle niveaus" else "All levels"),
            ClassLevel.BEGINNER to "Beginner",
            ClassLevel.INTERMEDIATE to (if (dutch) "Gemiddeld" else "Intermediate"),
            ClassLevel.ADVANCED to (if (dutch) "Gevorderd" else "Advanced"),
        )
        val type = if (dutch) "Groepsles" else "Group class"
        show(state(mobility))
        for ((level, word) in words) {
            current = state(mobility, level = level)
            compose.waitForIdle()

            compose.onNodeWithTag(ClassDateTags.EYEBROW).assertTextEquals("$type · $word")
            compose.onNodeWithTag(ClassDateTags.LEVEL)
                .assertContentDescriptionEquals(if (dutch) "Niveau: $word" else "Level: $word")
                .assertIsDisplayed()
        }
    }

    // F067 AC7: with Geen nothing about a level shows: the eyebrow is the type alone.
    @Test
    fun test_F067_AC7_aDateWithGeenShowsNothingAboutALevel() {
        show(state(mobility, level = null))

        compose.onNodeWithTag(ClassDateTags.EYEBROW).assertTextEquals(string(R.string.workspace_nav_new_group_class))
        compose.onNodeWithTag(ClassDateTags.LEVEL).assertDoesNotExist()
    }

    // F067 AC8: Sarah (a Trainer) sees the same level and has no control that changes it.
    @Test
    fun test_F067_AC8_aTrainerSeesTheSameLevelAndHasNoControlToChangeIt() {
        show(state(mobility, canManage = false, level = ClassLevel.ADVANCED))

        compose.onNodeWithTag(ClassDateTags.EYEBROW)
            .assertTextEquals(if (dutch) "Groepsles · Gevorderd" else "Group class · Advanced")
        compose.onNodeWithTag(ClassDateTags.LEVEL).assertIsDisplayed()
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.EDIT).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.LEVEL).assertHasNoClickAction()
    }

    // F067 AC1: the Owner has the level read-only on TD-03 too: Les wijzigen is web-only.
    @Test
    fun test_F067_AC1_theOwnerReadsTheLevelWithoutAControlOfItsOwn() {
        show(state(mobility, level = ClassLevel.BEGINNER))

        compose.onNodeWithTag(ClassDateTags.LEVEL).assertIsDisplayed().assertHasNoClickAction()
    }

    @Test
    fun test_F021_AC3_theScreenSaysWhenTheDateCouldNotBeReadAndWhenThePersonHasNoAccess() {
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            ClassDateScreen(
                ClassDateState(john.id, canManage = true, load = ClassDateLoad.Failed),
                "John's Gym",
                ClassDateActions({}, { calls++ }, {}, {}),
            )
        }
        compose.onNodeWithTag(ClassDateTags.ERROR).assertTextEquals(string(R.string.sessions_form_load_failed))
        compose.onNodeWithTag(ClassDateTags.RETRY).performClick()
        assertEquals(1, calls)
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
    }

    @Test
    fun test_F021_AC3_aDateTheApiRefusesNamesTheWorkspace() {
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            ClassDateScreen(
                ClassDateState(john.id, canManage = false, load = ClassDateLoad.NoPermission),
                "John's Gym",
                ClassDateActions({}, {}, {}, {}),
            )
        }

        compose.onNodeWithTag(ClassDateTags.NO_PERMISSION_TITLE).assertTextEquals(string(R.string.no_permission_title))
        compose.onNodeWithTag(ClassDateTags.NO_PERMISSION)
            .assertTextEquals(string(R.string.no_permission_body, "John's Gym"))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
