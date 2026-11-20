package app.fivvi.pro.sessions

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TeamMember
import app.fivvi.api.models.UpcomingSession
import app.fivvi.api.models.UpcomingSessions
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.clients.ClientProfileTags
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// **+** → *Privésessie* (PS-04), the session screen (TD-02) and *Verplaatsen* (PS-05), through the app with a fake API, in
// both languages: Sarah (a Trainer) and John (the Owner) of John's Gym, Anna de Vries and Mark Jansen as clients.
@RunWith(Parameterized::class)
class PrivateSessionFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val clients = FakeClientsApi()
    private val sessions = FakeSessionsApi()
    private val locations = FakeLocationsApi()
    private val trainers = FakeTrainersApi()
    private val team = FakeTeamApi()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val mark = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.EN)
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val john = trainerOf("John")

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private val trainerCapabilities = listOf(
        MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW,
        MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE,
        MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW,
        MeWorkspace.Capabilities.LOCATION_PERIOD_READ,
        MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN,
    )

    private fun launchAsSarah(capabilities: List<MeWorkspace.Capabilities> = trainerCapabilities) {
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            capabilities = capabilities,
            role = MeWorkspace.Role.TRAINER,
        )
        launch()
    }

    private fun launchAsJohn() {
        me.answerAccount(email = "owner@example.com", name = "John")
        launch()
    }

    private fun launch() {
        clients.clients += listOf(anna, mark)
        sessions.clients += listOf(anna, mark).associateBy { it.id }
        trainers.trainers = listOf(john, sarah, tom)
        sessions.trainers += listOf(john, sarah, tom).associateBy { it.id }
        team.members = listOf(
            TeamMember(john.id, "John", "owner@example.com", TeamMember.Role.OWNER),
            TeamMember(sarah.id, "Sarah", "trainer@example.com", TeamMember.Role.TRAINER),
        )
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            workspacesApi = FakeWorkspacesApi(),
            clientsApi = clients,
            trainersApi = trainers,
            sessionsApi = sessions,
            locationsApi = locations,
            teamApi = team,
        )
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
    }

    private fun openNewSession() {
        compose.onNodeWithTag(HomeTags.NEW).performClick()
        compose.onNodeWithTag(HomeTags.NEW_PRIVATE_SESSION).performClick()
        compose.waitUntilTagExists(NewSessionTags.SAVE)
        compose.waitUntilTagExists(NewSessionTags.CLIENT)
    }

    private fun chooseClient(client: Client) {
        compose.onNodeWithTag(NewSessionTags.CLIENT).performClick()
        compose.waitUntilTagExists("${ClientPickerTags.ROW}.${client.id}")
        compose.onNodeWithTag("${ClientPickerTags.ROW}.${client.id}").performClick()
        compose.waitUntilTagExists(NewSessionTags.CLIENT_NAME)
    }

    // AC1: + shows Privésessie for a team member who trains in the workspace.
    @Test
    fun test_F020_AC1_thePlusOffersAPrivateSessionToATrainer() {
        launchAsSarah()

        compose.onNodeWithTag(HomeTags.NEW).performClick()

        compose.onNodeWithTag(
            HomeTags.NEW_PRIVATE_SESSION,
        ).assertTextEquals(string(R.string.workspace_nav_new_private_session))
    }

    @Test
    fun test_F020_AC1_withoutTheRightToPlanSessionsThereIsNoPlus() {
        launchAsSarah(trainerCapabilities - MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN)

        compose.onNodeWithTag(HomeTags.NEW).assertDoesNotExist()
    }

    // AC2: the trainer field is fixed for a Trainer.
    @Test
    fun test_F020_AC2_theTrainerFieldIsFixedForATrainer() {
        launchAsSarah()

        openNewSession()

        compose.onNodeWithTag(
            NewSessionTags.TRAINER_FIXED,
        ).assertTextEquals(string(R.string.sessions_form_trainer_me, "Sarah"))
        compose.onNodeWithTag(NewSessionTags.TRAINER).assertDoesNotExist()
        compose.onNodeWithTag(
            NewSessionTags.LOCATION,
        ).assertTextEquals(string(R.string.sessions_form_location, "John's Gym"))
    }

    // AC2: it lists all trainers for the Owner.
    @Test
    fun test_F020_AC2_theOwnerChoosesAmongAllTrainers() {
        launchAsJohn()

        openNewSession()

        compose.onNodeWithTag(
            NewSessionTags.TRAINER_VALUE,
        ).assertTextEquals(string(R.string.sessions_form_trainer_me, "John"))
        compose.onNodeWithTag(NewSessionTags.TRAINER).performScrollTo().performClick()
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${sarah.id}").assertIsDisplayed()
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${tom.id}").performClick()
        compose.onNodeWithTag(NewSessionTags.TRAINER_VALUE).assertTextEquals("Tom")

        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()

        compose.waitUntilTagExists(SessionTags.TITLE)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { sessions.created.isNotEmpty() }
        assertEquals(tom.id, sessions.created.single().second.trainerId)
        compose.waitUntilTagExists(SessionTags.TRAINER)
        compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals("Tom")
    }

    // AC10: creating from + opens TD-02 with the data of the session; the location has a Route, the workspace the trainer.
    @Test
    fun test_F020_AC10_createPrivateSessionOpensSession() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)

        compose.onNodeWithTag(NewSessionTags.NOTIFY).assertIsDisplayed()
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsEnabled().performClick()

        compose.waitUntilTagExists(SessionTags.LOCATION)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { sessions.created.isNotEmpty() }
        val request = sessions.created.single().second
        assertEquals(anna.id, request.clientId)
        assertNull(request.trainerId)
        assertEquals(true, request.notify)
        compose.onNodeWithTag(
            SessionTags.TITLE,
        ).assertTextEquals(string(R.string.sessions_page_heading, "Anna de Vries"))
        compose.onNodeWithTag(SessionTags.LOCATION).assertTextEquals("John's Gym")
        compose.onNodeWithTag(SessionTags.ROUTE).assertIsDisplayed()
        compose.onNodeWithTag(SessionTags.WORKSPACE).assertTextEquals("John's Gym")
        // The trainer row reads *Jij* once the trainers are read (the person is told from them by name).
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching {
                compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals(string(R.string.sessions_page_you))
            }.isSuccess
        }
    }

    // AC10: with no connection Opslaan is off, with the text that says so; nothing is queued.
    @Test
    fun test_F020_AC10_offlineDisablesSave() {
        launchAsSarah()
        locations.failure = IOException("offline")

        compose.onNodeWithTag(HomeTags.NEW).performClick()
        compose.onNodeWithTag(HomeTags.NEW_PRIVATE_SESSION).performClick()

        compose.waitUntilTagExists(NewSessionTags.OFFLINE)
        compose.onNodeWithTag(NewSessionTags.OFFLINE).assertTextEquals(string(R.string.sessions_form_offline))
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsNotEnabled()
        assertEquals(0, sessions.created.size)

        locations.failure = null
        compose.onNodeWithTag(NewSessionTags.RETRY).performClick()
        compose.waitUntilTagExists(NewSessionTags.CLIENT)
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsEnabled()
    }

    // PS-04 (information-architecture §5.2): leaving with something entered asks first; a form with nothing in it closes at once.
    @Test
    fun test_F020_AC1_leavingAFormWithAClientAsksToDiscard() {
        launchAsSarah()
        openNewSession()
        compose.onNodeWithTag(NewSessionTags.CANCEL).performClick()
        compose.waitUntilTagExists(HomeTags.NEW)

        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.CANCEL).performClick()

        compose.onNodeWithTag(NewSessionTags.KEEP_EDITING).assertTextEquals(string(R.string.sessions_form_keep_editing))
        compose.onNodeWithTag(NewSessionTags.KEEP_EDITING).performClick()
        compose.onNodeWithTag(NewSessionTags.CLIENT_NAME).assertTextEquals("Anna de Vries")
        compose.onNodeWithTag(NewSessionTags.CANCEL).performClick()
        compose.onNodeWithTag(NewSessionTags.DISCARD).assertTextEquals(string(R.string.sessions_form_discard))
        compose.onNodeWithTag(NewSessionTags.DISCARD).performClick()
        compose.waitUntilTagExists(HomeTags.NEW)
        assertEquals(0, sessions.created.size)
    }

    // AC6: the move with the client notified (the default for a session to come) and without.
    @Test
    fun test_F020_AC6_rescheduleWithNotifyAndTheDoneText() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        compose.onNodeWithTag(
            RescheduleTags.SUBMIT,
        ).assertTextEquals(string(R.string.sessions_reschedule_submit_notify))
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()

        compose.waitUntilTagExists(SessionTags.MOVED)
        assertEquals(true, sessions.moved.single().third.notify)
        compose.onNodeWithTag(SessionTags.MOVED).assertIsDisplayed()
    }

    @Test
    fun test_F020_AC6_rescheduleWithoutNotifySaysRescheduleAndSendsNoEmail() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.NOTIFY)
        compose.onNodeWithTag(RescheduleTags.NOTIFY).performScrollTo().performClick()
        compose.onNodeWithTag(RescheduleTags.SUBMIT).assertTextEquals(string(R.string.sessions_reschedule_submit))
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()

        compose.waitUntilTagExists(SessionTags.MOVED)
        assertEquals(false, sessions.moved.single().third.notify)
    }

    // AC8: someone else changed the session first: the form says who, in the words of the API's 409.
    @Test
    fun test_F020_AC8_aConflictShowsWhoChangedTheSession() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        val theirs = sessions.sessions.values.single().let { sessionOf(it.id, anna, sarah, version = 5) }
        sessions.rescheduleAnswers += { _, _ -> sessions.conflict(theirs, changedBy = "Tom") }

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()

        compose.waitUntilTagExists(RescheduleTags.FAILED)
        compose.onNodeWithTag(
            RescheduleTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_reschedule_changed_by, "Tom"))
    }

    // F023 AC6 (PS-07): plans a session of Anna for [trainer] (the Owner's choice; none for a Trainer) at the form's first start.
    private fun planFirstSession(trainer: app.fivvi.api.models.Trainer? = null) {
        openNewSession()
        if (trainer != null) {
            compose.onNodeWithTag(NewSessionTags.TRAINER).performScrollTo().performClick()
            compose.onNodeWithTag("${NewSessionTags.TRAINER}.${trainer.id}").performClick()
        }
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        app.pressBack()
        compose.waitUntilTagExists(HomeTags.NEW)
    }

    private fun typeOfPrivateSession() = string(R.string.sessions_double_booking_type_private)

    @Test
    fun test_F023_AC6_planningOverOneOfYourOwnSessionsWarnsAndSaveAnywaySavesIt() {
        launchAsSarah()
        planFirstSession()
        openNewSession()
        chooseClient(mark)

        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()

        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX))
        compose.onNodeWithText(string(R.string.sessions_double_booking_title_own)).assertIsDisplayed()
        compose.onNodeWithText("(${typeOfPrivateSession()})", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Anna de Vries", substring = true).assertIsDisplayed()
        compose.onNodeWithTag(
            DoubleBookingTags.back(NewSessionTags.PREFIX),
        ).assertTextEquals(string(R.string.sessions_double_booking_back))
        compose.onNodeWithTag(
            DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX),
        ).assertTextEquals(string(R.string.sessions_double_booking_save_anyway))

        // *Terug*: the form stays as it was and nothing more is sent.
        compose.onNodeWithTag(DoubleBookingTags.back(NewSessionTags.PREFIX)).performClick()
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX)).assertDoesNotExist()
        compose.onNodeWithTag(NewSessionTags.CLIENT_NAME).assertTextEquals("Mark Jansen")
        assertEquals(2, sessions.created.size)

        // *Toch opslaan*: the same request again, with allowConflicts.
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX))
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX)).performClick()

        compose.waitUntilTagExists(SessionTags.TITLE)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { sessions.created.size == 4 }
        assertEquals(sessions.created[1].second, sessions.created[2].second)
        assertEquals(sessions.created[2].second.copy(allowConflicts = true), sessions.created[3].second)
        assertEquals(2, sessions.sessions.size)
    }

    @Test
    fun test_F023_AC6_anOwnerPlanningForTomOverASessionOfTomNamesHim() {
        launchAsJohn()
        planFirstSession(tom)
        openNewSession()
        compose.onNodeWithTag(NewSessionTags.TRAINER).performScrollTo().performClick()
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${tom.id}").performClick()
        chooseClient(mark)

        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()

        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(NewSessionTags.PREFIX))
        compose.onNodeWithText(string(R.string.sessions_double_booking_title, "Tom")).assertIsDisplayed()
    }

    @Test
    fun test_F023_AC6_movingASessionOverAnotherOfYoursWarnsAndSaveAnywayMovesIt() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        val planned = sessions.sessions.values.single()
        // Mark's session of Sarah's, at the same time: moving Anna's (with no other change) overlaps it.
        val other = sessionOf(
            id = sessionIdOf("mark"),
            client = mark,
            trainer = sarah,
            start = planned.startsAt.atZoneSameInstant(java.time.ZoneId.of(planned.timeZone)).toLocalDateTime(),
        )
        sessions.sessions[other.id] = other
        // The trainer row reads *Jij* once the person is found among the trainers: the warning then names no one.
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching {
                compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals(string(R.string.sessions_page_you))
            }.isSuccess
        }

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()

        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX))
        compose.onNodeWithText(string(R.string.sessions_double_booking_title_own)).assertIsDisplayed()
        compose.onNodeWithText("Mark Jansen", substring = true).assertIsDisplayed()
        compose.onNodeWithTag(DoubleBookingTags.back(RescheduleTags.PREFIX)).performClick()
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX)).assertDoesNotExist()
        assertEquals(1, sessions.moved.size)

        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()
        compose.waitUntilTagExists(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX))
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX)).performClick()

        compose.waitUntilTagExists(SessionTags.MOVED)
        assertEquals(3, sessions.moved.size)
        assertEquals(true, sessions.moved.last().third.allowConflicts)
        assertEquals(sessions.moved[0].third.version, sessions.moved.last().third.version)
    }

    // AC13: the owner took the right away while the form was open.
    @Test
    fun test_F023_AC13_aRefusalOfTheMoveSaysThePersonHasNoRightsAnymore() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        sessions.rescheduleAnswers += { _, _ -> sessions.status(403) }
        // The refusal makes the capability helper read the account again; the rights are still listed.
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            capabilities = trainerCapabilities,
            role = MeWorkspace.Role.TRAINER,
        )

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()

        compose.waitUntilTagExists(RescheduleTags.FAILED)
        compose.onNodeWithTag(
            RescheduleTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_reschedule_no_permission))
    }

    // AC9: Klantprofiel from the session shows the client's Komende sessies, and a row opens the session again.
    @Test
    fun test_F020_AC9_clientProfileShowsUpcomingSessions() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        val planned = sessions.sessions.values.single()
        sessions.upcoming[anna.id] = UpcomingSessions(
            anna.id,
            "Europe/Amsterdam",
            listOf(
                UpcomingSession(
                    planned.id,
                    planned.startsAt,
                    planned.endsAt,
                    planned.trainer,
                ),
            ),
        )

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.CLIENT_PROFILE).performClick()

        compose.waitUntilTagExists(ClientProfileTags.UPCOMING_TITLE)
        compose.onNodeWithTag(
            ClientProfileTags.UPCOMING_TITLE,
        ).assertTextEquals(string(R.string.clients_profile_upcoming_title))
        compose.onNodeWithTag("${ClientProfileTags.UPCOMING}.${planned.id}").performClick()
        compose.waitUntilTagExists(SessionTags.TITLE)
        compose.onNodeWithTag(SessionTags.CLIENT).assertIsDisplayed()

        app.pressBack()
        compose.waitUntilTagExists(ClientProfileTags.UPCOMING_TITLE)
    }

    // AC9: a session opened again from Komende sessies is read again, and shows nothing of the earlier opening.
    @Test
    fun test_F020_AC9_openingTheSameSessionAgainReadsItAgainAndForgetsTheMovedMessage() {
        launchAsSarah()
        openNewSession()
        chooseClient(anna)
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()
        compose.waitUntilTagExists(SessionTags.MOVED)
        val planned = sessions.sessions.values.single()
        sessions.upcoming[anna.id] = UpcomingSessions(
            anna.id,
            "Europe/Amsterdam",
            listOf(UpcomingSession(planned.id, planned.startsAt, planned.endsAt, planned.trainer)),
        )
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.CLIENT_PROFILE).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.UPCOMING}.${planned.id}")
        // Someone else gave the session to Tom meanwhile.
        sessions.sessions[planned.id] = sessionOf(planned.id, anna, tom, version = planned.version + 1)

        compose.onNodeWithTag("${ClientProfileTags.UPCOMING}.${planned.id}").performClick()

        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching { compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals("Tom") }.isSuccess
        }
        compose.onNodeWithTag(SessionTags.MOVED).assertDoesNotExist()
    }

    // The client list inside PS-04 is the one of Klanten: a search narrows it.
    @Test
    fun test_F020_AC1_theClientListHasASearch() {
        launchAsSarah()
        openNewSession()

        compose.onNodeWithTag(NewSessionTags.CLIENT).performClick()
        compose.waitUntilTagExists(ClientPickerTags.SEARCH)
        compose.onNodeWithTag(ClientPickerTags.ADD).assertIsDisplayed()
        compose.onNodeWithTag("${ClientPickerTags.ROW}.${anna.id}").assertIsDisplayed()
        compose.onNodeWithTag("${ClientPickerTags.ROW}.${mark.id}").assertIsDisplayed()

        app.pressBack()
        compose.waitUntilTagExists(NewSessionTags.SAVE)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
