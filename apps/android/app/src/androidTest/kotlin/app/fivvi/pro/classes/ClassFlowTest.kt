package app.fivvi.pro.classes

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import app.fivvi.api.models.Client
import app.fivvi.api.models.FirstGroupClassDate
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.DoubleBookingTags
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// **+** → *Groepsles* (TD-05) and the class on a date (TD-03), through the app with a fake API, in both languages: John (the
// Owner) and Sarah (a Trainer) of John's Gym.
@RunWith(Parameterized::class)
class ClassFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val locations = FakeLocationsApi()
    private val trainers = FakeTrainersApi()
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val john = trainerOf("John")
    private val dutch get() = language == AppLanguage.DUTCH

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private val trainerCapabilities = listOf(
        MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW,
        MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW,
        MeWorkspace.Capabilities.LOCATION_PERIOD_READ,
        MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN,
        MeWorkspace.Capabilities.CLASS_PERIOD_READ,
    )

    private fun launchAsSarah() {
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            capabilities = trainerCapabilities,
            role = MeWorkspace.Role.TRAINER,
            teamMemberId = sarah.id,
        )
        launch()
    }

    private fun launchAsJohn() {
        me.answerAccount(email = "owner@example.com", name = "John", teamMemberId = john.id)
        launch()
    }

    private fun launch() {
        trainers.trainers = listOf(john, sarah, tom)
        sessions.trainers += listOf(john, sarah, tom).associateBy { it.id }
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            workspacesApi = FakeWorkspacesApi(),
            clientsApi = FakeClientsApi(),
            trainersApi = trainers,
            sessionsApi = sessions,
            locationsApi = locations,
            groupClassesApi = classes,
        )
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
    }

    private fun openNewClass() {
        compose.onNodeWithTag(HomeTags.NEW).performClick()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).performClick()
        compose.waitUntilTagExists(NewClassTags.SAVE)
        compose.waitUntilTagExists(NewClassTags.NAME_NL)
    }

    private fun type(tag: String, text: String) {
        compose.onNodeWithTag(tag).performScrollTo().performTextInput(text)
    }

    private fun save() {
        compose.onNodeWithTag(NewClassTags.SAVE).performClick()
    }

    // AC6: John adds "Mobility" on a date; TD-03 opens with "Groepsles toegevoegd".
    @Test
    fun test_F021_AC6_johnAddsMobilityFromThePlusAndTd03OpensWithGroepslesToegevoegd() {
        launchAsJohn()

        compose.onNodeWithTag(HomeTags.NEW).performClick()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).assertTextEquals(string(R.string.workspace_nav_new_group_class))
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).performClick()
        compose.waitUntilTagExists(NewClassTags.NAME_NL)
        compose.onNodeWithTag(NewClassTags.TITLE).assertTextEquals(string(R.string.classes_app_new_title))
        type(NewClassTags.NAME_NL, "Mobility")
        save()

        compose.waitUntilTagExists(ClassDateTags.TITLE)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { classes.created.isNotEmpty() }
        val request = classes.created.single().second
        assertEquals("Mobility", request.nameNl)
        assertEquals(12, request.capacity)
        assertEquals(john.id, request.trainerId)
        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals("Mobility")
        compose.onNodeWithTag(ClassDateTags.ADDED).assertTextEquals(string(R.string.classes_schedule_saved))
        compose.onNodeWithTag(ClassDateTags.LOCATION).assertTextEquals("John's Gym")
        compose.onNodeWithTag(ClassDateTags.BOOKED).assertIsDisplayed()
        // The trainer row reads *Jij* once the viewer is told from the trainers by their team-member ID.
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals(string(R.string.sessions_page_you))
    }

    // TD-05 starts with capacity 12, the person as trainer, the default location and Niet herhalen.
    @Test
    fun test_F021_AC6_theFormStartsWithCapacity12ThePersonAsTrainerTheLocationAndNietHerhalen() {
        launchAsJohn()

        openNewClass()

        compose.onNodeWithTag(NewClassTags.CAPACITY_VALUE).performScrollTo().assertTextEquals("12")
        compose.onNodeWithTag(NewClassTags.TRAINER_VALUE).performScrollTo()
            .assertTextEquals(string(R.string.sessions_form_trainer_me, "John"))
        compose.onNodeWithTag(NewClassTags.LOCATION).performScrollTo()
            .assertTextEquals(string(R.string.classes_schedule_location, "John's Gym"))
        compose.onNodeWithTag(NewClassTags.REPEAT_VALUE).performScrollTo()
            .assertTextEquals(string(R.string.classes_schedule_repeat_none))
        compose.onNodeWithTag(NewClassTags.END_VALUE).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag(NewClassTags.SAVE).assertIsEnabled()
    }

    // Design: John adds Mobility with a Dutch and an English description from +; TD-03 shows it in the app's language with
    // Meer / Minder.
    @Test
    fun test_F021_design_johnAddsMobilityWithBothDescriptionsAndTd03ShowsTheOneOfTheAppsLanguageWithMeerAndMinder() {
        launchAsJohn()
        openNewClass()

        type(NewClassTags.NAME_NL, "Mobility")
        type(NewClassTags.NAME_EN, "Mobility flow")
        type(NewClassTags.DESCRIPTION_NL, "Rustig bewegen en rekken.")
        type(NewClassTags.DESCRIPTION_EN, "Gentle moving and stretching.")
        app.hideKeyboard(compose)
        save()

        compose.waitUntilTagExists(ClassDateTags.DESCRIPTION)
        val sent = classes.created.single().second
        assertEquals("Mobility flow", sent.nameEn)
        assertEquals("Rustig bewegen en rekken.", sent.descriptionNl)
        assertEquals("Gentle moving and stretching.", sent.descriptionEn)
        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals(if (dutch) "Mobility" else "Mobility flow")
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION).assertTextEquals(
            if (dutch) "Rustig bewegen en rekken." else "Gentle moving and stretching.",
        )
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE)
            .assertTextEquals(string(R.string.classes_app_description_more))
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE).performClick()
        compose.onNodeWithTag(ClassDateTags.DESCRIPTION_TOGGLE)
            .assertTextEquals(string(R.string.classes_app_description_less))
    }

    // Design: John's ⋯ on TD-03 has Les wijzigen, which tells him to use the web.
    @Test
    fun test_F021_design_johnsMenuOnTd03HasLesWijzigenWhichTellsHimToUseTheWeb() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)
        save()
        compose.waitUntilTagExists(ClassDateTags.MENU)

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.onNodeWithTag(ClassDateTags.EDIT).assertTextEquals(string(R.string.classes_app_edit))
        compose.onNodeWithTag(ClassDateTags.EDIT).performClick()

        compose.onNodeWithTag(ClassDateTags.MANAGE_ON_WEB).assertTextEquals(string(R.string.classes_app_manage_on_web))
        compose.onNodeWithTag(ClassDateTags.OWNER_NOTE).assertIsDisplayed()
    }

    // AC7: Sarah's + has no Groepsles and shows the footnote.
    @Test
    fun test_F021_AC7_sarahsPlusHasNoGroepslesAndShowsTheFootnote() {
        launchAsSarah()

        compose.onNodeWithTag(HomeTags.NEW).performClick()

        compose.onNodeWithTag(HomeTags.NEW_PRIVATE_SESSION).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS_NOTE)
            .assertTextEquals(string(R.string.workspace_nav_new_group_class_note, "John's Gym"))
    }

    @Test
    fun test_F021_AC7_johnsPlusShowsNoFootnote() {
        launchAsJohn()

        compose.onNodeWithTag(HomeTags.NEW).performClick()

        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.NEW_PRIVATE_SESSION).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS_NOTE).assertDoesNotExist()
    }

    // Trainer nodig: choosing it sends no trainer and TD-03 says so.
    @Test
    fun test_F021_AC5_aClassWithoutATrainerShowsTrainerNodigOnTd03() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)

        compose.onNodeWithTag(NewClassTags.TRAINER).performScrollTo().performClick()
        compose.onNodeWithTag(NewClassTags.TRAINER_NEEDED).performClick()
        val needed = string(R.string.classes_trainer_needed, string(R.string.trainer_word_trainer_word_cap))
        compose.onNodeWithTag(NewClassTags.TRAINER_VALUE).assertTextEquals(needed)
        save()

        compose.waitUntilTagExists(ClassDateTags.TRAINER)
        assertNull(classes.created.single().second.trainerId)
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals(needed)
    }

    @Test
    fun test_F021_AC6_theOwnerCanChooseAnotherTrainerAndTd03NamesThem() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)

        compose.onNodeWithTag(NewClassTags.TRAINER).performScrollTo().performClick()
        compose.onNodeWithTag("${NewClassTags.TRAINER}.${tom.id}").performClick()
        save()

        compose.waitUntilTagExists(ClassDateTags.TRAINER)
        assertEquals(tom.id, classes.created.single().second.trainerId)
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals("Tom")
    }

    @Test
    fun test_F021_AC6_theCapacityStepsAndIsSent() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)

        compose.onNodeWithTag(NewClassTags.CAPACITY_UP).performScrollTo().performClick()
        compose.onNodeWithTag(NewClassTags.CAPACITY_VALUE).assertTextEquals("13")
        compose.onNodeWithTag(NewClassTags.CAPACITY_DOWN).performClick()
        compose.onNodeWithTag(NewClassTags.CAPACITY_DOWN).performClick()
        compose.onNodeWithTag(NewClassTags.CAPACITY_VALUE).assertTextEquals("11")
        save()

        compose.waitUntilTagExists(ClassDateTags.BOOKED)
        assertEquals(11, classes.created.single().second.capacity)
        compose.onNodeWithTag(ClassDateTags.BOOKED).assertTextEquals(
            if (dutch) "0/11 geboekt · 11 plekken vrij" else "0/11 booked · 11 spots free",
        )
    }

    // A screen reader hears what the capacity buttons change, not just "Minder" and "Meer".
    @Test
    fun test_F021_AC6_theCapacityButtonsAreNamedAfterTheCapacity() {
        launchAsJohn()
        openNewClass()

        compose.onNodeWithTag(NewClassTags.CAPACITY_DOWN).performScrollTo()
            .assertContentDescriptionEquals(string(R.string.classes_app_capacity_less))
        compose.onNodeWithTag(NewClassTags.CAPACITY_UP)
            .assertContentDescriptionEquals(string(R.string.classes_app_capacity_more))
        val (less, more) = if (dutch) {
            "Capaciteit verlagen" to "Capaciteit verhogen"
        } else {
            "Decrease capacity" to "Increase capacity"
        }
        assertEquals(less, string(R.string.classes_app_capacity_less))
        assertEquals(more, string(R.string.classes_app_capacity_more))
    }

    // The API refuses the name: the message sits under the field, the form stays.
    @Test
    fun test_F021_AC6_aRefusedNameShowsTheApisMessageUnderTheFieldAndKeepsTheForm() {
        launchAsJohn()
        classes.createAnswers += { sessions.refused("nameNl" to "too_small") }
        openNewClass()

        save()

        compose.waitUntilTagExists(NewClassTags.NAME_NL_ERROR)
        compose.onNodeWithTag(
            NewClassTags.NAME_NL_ERROR,
        ).assertTextEquals(string(R.string.classes_form_errors_name_required))
        compose.onNodeWithTag(NewClassTags.SAVE).assertIsEnabled()
        compose.onNodeWithTag(ClassDateTags.TITLE).assertDoesNotExist()
    }

    // F023 (PS-07): the trainer has something else then; Terug keeps the form, Toch opslaan saves the same request again.
    @Test
    fun test_F023_AC6_aTrainerWhoAlreadyHasSomethingGetsTheDoubleBookingAlertAndTochOpslaanSavesIt() {
        launchAsJohn()
        val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
        // John has a session that covers the form's first start (the next full hour), whenever the test runs.
        val booked = sessionOf(
            client = anna,
            trainer = john,
            start = LocalDateTime.now(ZoneId.of("Europe/Amsterdam")).minusHours(1),
            minutes = 240,
        )
        sessions.sessions[booked.id] = booked
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)

        save()

        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(NewClassTags.PREFIX))
        compose.onNodeWithText(string(R.string.sessions_double_booking_title_own)).assertIsDisplayed()
        compose.onNodeWithText("Anna de Vries", substring = true).assertIsDisplayed()
        compose.onNodeWithTag(DoubleBookingTags.back(NewClassTags.PREFIX))
            .assertTextEquals(string(R.string.sessions_double_booking_back))
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(NewClassTags.PREFIX))
            .assertTextEquals(string(R.string.sessions_double_booking_save_anyway))

        // *Terug*: the form stays as it was and nothing more is sent.
        compose.onNodeWithTag(DoubleBookingTags.back(NewClassTags.PREFIX)).performClick()
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(NewClassTags.PREFIX)).assertDoesNotExist()
        assertEquals(1, classes.created.size)
        assertTrue(classes.classes.isEmpty())

        // *Toch opslaan*: the same request again, with allowConflicts.
        save()
        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(NewClassTags.PREFIX))
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(NewClassTags.PREFIX)).performClick()

        compose.waitUntilTagExists(ClassDateTags.TITLE)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { classes.created.size == 3 }
        assertEquals(classes.created[1].second, classes.created[0].second)
        assertEquals(classes.created[1].second.copy(allowConflicts = true), classes.created[2].second)
        assertEquals(1, classes.classes.size)
    }

    // PS-04's pattern for a lost connection: the form says so, *Opslaan* is off, nothing is queued.
    @Test
    fun test_F021_AC6_offlineDisablesSaveWithTheTextThatSaysSo() {
        launchAsJohn()
        locations.failure = IOException("offline")

        compose.onNodeWithTag(HomeTags.NEW).performClick()
        compose.onNodeWithTag(HomeTags.NEW_GROUP_CLASS).performClick()

        compose.waitUntilTagExists(NewClassTags.OFFLINE)
        compose.onNodeWithTag(NewClassTags.OFFLINE).assertTextEquals(string(R.string.sessions_form_offline))
        compose.onNodeWithTag(NewClassTags.SAVE).assertIsNotEnabled()
        assertEquals(0, classes.created.size)

        locations.failure = null
        compose.onNodeWithTag(NewClassTags.RETRY).performClick()
        compose.waitUntilTagExists(NewClassTags.NAME_NL)
        compose.onNodeWithTag(NewClassTags.SAVE).assertIsEnabled()
    }

    // Leaving with something entered asks first; a form with nothing in it closes at once.
    @Test
    fun test_F021_AC6_leavingAFormWithSomethingEnteredAsksToDiscard() {
        launchAsJohn()
        openNewClass()
        compose.onNodeWithTag(NewClassTags.CANCEL).performClick()
        compose.waitUntilTagExists(HomeTags.NEW)

        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        compose.onNodeWithTag(NewClassTags.CANCEL).performClick()

        compose.onNodeWithTag(NewClassTags.KEEP_EDITING).assertTextEquals(string(R.string.sessions_form_keep_editing))
        compose.onNodeWithTag(NewClassTags.KEEP_EDITING).performClick()
        compose.onNodeWithTag(NewClassTags.NAME_NL).assertIsDisplayed()
        compose.onNodeWithTag(NewClassTags.CANCEL).performClick()
        compose.onNodeWithTag(NewClassTags.DISCARD).assertTextEquals(string(R.string.sessions_form_discard))
        compose.onNodeWithTag(NewClassTags.DISCARD).performClick()
        compose.waitUntilTagExists(HomeTags.NEW)
        assertEquals(0, classes.created.size)
    }

    @Test
    fun test_F021_AC6_backFromTd03IsTheHome() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)
        save()
        compose.waitUntilTagExists(ClassDateTags.TITLE)

        app.pressBack()

        compose.waitUntilTagExists(HomeTags.NEW)
        compose.onNodeWithText("John's Gym").assertIsDisplayed()
    }

    // F022: Herhalen offers Niet herhalen and Elke week op {weekday}; the weekly choice shows its note.
    private val formatLocale get() = if (dutch) Locale.forLanguageTag("nl-NL") else Locale.UK

    // The menu is a popup window: wait for its options before they are read or tapped.
    private fun openRepeatMenu() {
        compose.onNodeWithTag(NewClassTags.REPEAT).performScrollTo().performClick()
        compose.waitUntilTagExists(NewClassTags.REPEAT_NONE)
        compose.waitUntilTagExists(NewClassTags.REPEAT_WEEKLY)
    }

    private fun chooseWeekly() {
        openRepeatMenu()
        compose.onNodeWithTag(NewClassTags.REPEAT_WEEKLY).performClick()
    }

    private fun weekdayName(localDate: String) =
        LocalDate.parse(localDate).dayOfWeek.getDisplayName(TextStyle.FULL, formatLocale)

    // The weekday in Elke week op is the form's date: it is compared with the date the form sent, not with the clock.
    @Test
    fun test_F022_AC6_herhalenOffersNietHerhalenAndElkeWeekOpTheWeekdayAndTheNoteShowsWithTheWeeklyChoice() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)

        compose.onNodeWithTag(NewClassTags.REPEAT_NOTE).assertDoesNotExist()
        openRepeatMenu()
        compose.onNodeWithTag(NewClassTags.REPEAT_NONE).assertTextEquals(string(R.string.classes_schedule_repeat_none))
        compose.onNodeWithTag(NewClassTags.REPEAT_WEEKLY).performClick()

        val value = compose.onNodeWithTag(NewClassTags.REPEAT_VALUE).performScrollTo()
        val shown = value.fetchSemanticsNode().config.getOrNull(SemanticsProperties.Text)?.joinToString("")
        compose.onNodeWithTag(NewClassTags.REPEAT_NOTE).assertTextEquals(string(R.string.classes_schedule_repeat_note))
        save()

        compose.waitUntilTagExists(ClassDateTags.SERIES)
        val sent = classes.created.single().second.firstDate!!
        assertEquals(string(R.string.classes_schedule_repeat_weekly, weekdayName(sent.localDate)), shown)
    }

    // AC6: John adds a weekly Mobility; the class and the series with 12 dates exist; TD-03 opens with 12 added and the line.
    @Test
    fun test_F022_AC6_ownerAddsAWeeklyMobilityAndTD03ShowsTwelveAddedAndTheSeriesLine() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)
        chooseWeekly()
        compose.onNodeWithTag(NewClassTags.REPEAT_NOTE).assertTextEquals(string(R.string.classes_schedule_repeat_note))
        save()

        compose.waitUntilTagExists(ClassDateTags.SERIES)
        val sent = classes.created.single().second.firstDate!!
        assertEquals(FirstGroupClassDate.Repeat.WEEKLY, sent.repeat)
        assertEquals(1, classes.created.size)
        assertEquals(WEEKLY_DATES, sessions.sessions.size)
        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals("Mobility")
        compose.onNodeWithTag(ClassDateTags.ADDED).assertTextEquals(
            if (dutch) "12 groepslessen toegevoegd" else "12 group classes added",
        )
        compose.onNodeWithTag(ClassDateTags.SERIES).assertTextEquals(
            string(R.string.classes_date_series_line, "Mobility", sent.localStart, weekdayName(sent.localDate)),
        )
    }

    // AC6: a class added without Herhalen has no series line and the single confirmation.
    @Test
    fun test_F022_AC6_aClassWithoutHerhalenShowsGroepslesToegevoegdAndNoSeriesLine() {
        launchAsJohn()
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)
        save()

        compose.waitUntilTagExists(ClassDateTags.ADDED)
        compose.onNodeWithTag(ClassDateTags.ADDED).assertTextEquals(string(R.string.classes_schedule_saved))
        compose.onNodeWithTag(ClassDateTags.SERIES).assertDoesNotExist()
    }

    // AC7: the API refuses a weekly start the clocks skip; its message shows with the date it names and nothing is created.
    @Test
    fun test_F022_AC7_aWeeklyStartTheClocksSkipShowsTheDstMessageWithTheDateAndNothingIsCreated() {
        launchAsJohn()
        val skipped = LocalDate.now(ZoneId.of("Europe/Amsterdam")).plusWeeks(3)
        classes.skippedStart = skipped
        openNewClass()
        type(NewClassTags.NAME_NL, "Mobility")
        app.hideKeyboard(compose)
        chooseWeekly()
        save()

        compose.waitUntilTagExists(NewClassTags.TIME_ERROR)
        val day = SessionFormat(formatLocale, ZoneId.of("Europe/Amsterdam")).day(skipped)
        compose.onNodeWithTag(NewClassTags.TIME_ERROR)
            .assertTextEquals(string(R.string.classes_schedule_errors_time_does_not_exist, day))
        compose.onNodeWithTag(ClassDateTags.TITLE).assertDoesNotExist()
        assertTrue(classes.classes.isEmpty())
        assertTrue(sessions.sessions.isEmpty())
        assertEquals(1, classes.created.size)
        compose.onNodeWithTag(NewClassTags.TITLE).assertIsDisplayed()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
