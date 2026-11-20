package app.fivvi.pro.sessions

import app.fivvi.api.models.Client
import app.fivvi.api.models.PlanPrivateSessionRequest
import app.fivvi.api.models.Session
import app.fivvi.api.models.Trainer
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10): the form collects, the API plans and decides every rule.
@OptIn(ExperimentalCoroutinesApi::class)
class NewSessionViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val locations = FakeLocationsApi()
    private val trainers = FakeTrainersApi()
    private val clients = FakeClientsApi()
    private val notAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val john = trainerOf("John")

    // 8 September 2026, 10:20 in Amsterdam: the form starts at 11:00.
    private val now = Instant.parse("2026-09-08T08:20:00Z")

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sessions.clients[anna.id] = anna
        trainers.trainers = listOf(john, sarah, tom)
        sessions.trainers += listOf(john, sarah, tom).associateBy { it.id }
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    // The person, by their team-member ID in the workspace: Sarah's unless given.
    private fun viewModel(forAnyTrainer: Boolean = false, teamMemberId: UUID = sarah.id) = NewSessionViewModel(
        SessionApis(sessions, locations, trainers, FakeWorkspacesApi(), clients),
        workspace,
        forAnyTrainer,
        teamMemberId,
        onNotAllowed = { notAllowed += it.code() },
        now = { now },
    )

    private fun NewSessionViewModel.state() = state.value

    @Test
    fun test_F020_AC1_theFormStartsAtTheNextFullHourWithTheLocationOfTheWorkspace() {
        val viewModel = viewModel()

        val state = viewModel.state()
        assertEquals(NewSessionLoad.Ready, state.load)
        assertEquals("John's Gym", state.locationName)
        assertEquals(LocalDateTime.of(2026, 9, 8, 11, 0), state.time.start)
        assertEquals(60, state.time.durationMinutes)
        assertTrue(state.notify)
        assertNull(state.client)
    }

    @Test
    fun test_F020_AC1_aTrainerPlansASessionWithAClientThatTheApiStoresAndTheScreenOpens() {
        val viewModel = viewModel()
        viewModel.chooseClient(anna)
        viewModel.setDate(LocalDate.of(2026, 9, 24))
        viewModel.setStart(LocalTime.of(9, 0))

        viewModel.save()

        assertEquals(
            listOf(
                workspace to PlanPrivateSessionRequest(
                    anna.id,
                    "2026-09-24",
                    "09:00",
                    60,
                    true,
                    trainerId = null,
                    surface = PlanPrivateSessionRequest.Surface.ANDROID,
                ),
            ),
            sessions.created,
        )
        val saved = viewModel.state().saved
        assertEquals("Anna de Vries", saved?.participants?.single()?.name)
        assertEquals(sarah.id, saved?.trainer?.id)
        assertFalse(viewModel.state().saving)
    }

    @Test
    fun test_F020_AC1_savingWithoutAClientAsksForOneAndSendsNothing() {
        val viewModel = viewModel()

        viewModel.save()

        assertTrue(viewModel.state().clientMissing)
        assertTrue(sessions.created.isEmpty())
        viewModel.chooseClient(anna)
        assertFalse(viewModel.state().clientMissing)
    }

    @Test
    fun test_F020_AC1_theConfirmationIsOnByDefaultAndTheDurationCanBeAnyOfTheApisValues() {
        val viewModel = viewModel()
        viewModel.chooseClient(anna)
        viewModel.setNotify(false)
        viewModel.chooseDuration(NewSessionViewModel.OTHER)
        assertTrue(viewModel.state().time.otherChosen)
        viewModel.setOtherDuration(75)

        viewModel.save()

        val sent = sessions.created.single().second
        assertEquals(75, sent.durationMinutes)
        assertFalse(sent.notify)
    }

    @Test
    fun test_F020_AC2_aTrainerPlansForThemselvesAndTheFormNeverAsksForTheTrainers() {
        val viewModel = viewModel()
        viewModel.chooseClient(anna)

        viewModel.save()

        assertNull(sessions.created.single().second.trainerId)
        assertTrue(viewModel.state().trainers.isEmpty())
    }

    @Test
    fun test_F020_AC2_theOwnerChoosesAmongAllTrainersAndStartsOnThemselves() {
        val viewModel = viewModel(forAnyTrainer = true, teamMemberId = john.id)

        val state = viewModel.state()
        assertEquals(listOf("John", "Sarah", "Tom"), state.trainers.map { it.name })
        assertEquals(john.id, state.myTrainerId)
        assertEquals(john.id, state.trainerId)

        viewModel.chooseClient(anna)
        viewModel.setTrainer(tom.id)
        viewModel.save()

        assertEquals(tom.id, sessions.created.single().second.trainerId)
        assertEquals(tom.id, viewModel.state().saved?.trainer?.id)
    }

    @Test
    fun test_F020_1414_AC2_twoTrainersWithTheSameNameAreToldApartByTheirTeamMemberId() {
        val otherSarah = Trainer(UUID.nameUUIDFromBytes("the other Sarah".toByteArray()), "Sarah")
        trainers.trainers = listOf(sarah, otherSarah)
        sessions.trainers[otherSarah.id] = otherSarah

        val state = viewModel(forAnyTrainer = true, teamMemberId = otherSarah.id).state()

        assertEquals(otherSarah.id, state.myTrainerId)
        assertEquals(otherSarah.id, state.trainerId)
    }

    @Test
    fun test_F020_AC2_anOwnerWhoDoesNotTrainStartsWithoutATrainerAndMustChooseOne() {
        trainers.trainers = listOf(sarah, tom)
        val viewModel = viewModel(forAnyTrainer = true, teamMemberId = john.id)
        viewModel.chooseClient(anna)

        viewModel.save()

        assertTrue(viewModel.state().trainerMissing)
        assertTrue(sessions.created.isEmpty())
    }

    @Test
    fun test_F020_AC2_aRefusalOfThePlanTellsTheCapabilityHelperAndSaysSo() {
        sessions.createAnswers += { sessions.status(403) }
        val viewModel = viewModel()
        viewModel.chooseClient(anna)

        viewModel.save()

        assertEquals(SaveFailure.NoPermission, viewModel.state().saveFailure)
        assertEquals(listOf(403), notAllowed)
        assertNull(viewModel.state().saved)
    }

    // Thursday 24 September 2026, 09:00-10:00: the session of Anna with Sarah that a new one would overlap.
    private fun plannedForNine(trainer: Trainer = sarah) {
        val booked = sessionOf(client = anna, trainer = trainer)
        sessions.sessions[booked.id] = booked
    }

    private fun NewSessionViewModel.fillIn(start: LocalTime = LocalTime.of(9, 30)) {
        chooseClient(anna)
        setDate(LocalDate.of(2026, 9, 24))
        setStart(start)
    }

    @Test
    fun test_F023_AC6_aTrainerWhoAlreadyHasSomethingThenGetsTheDoubleBookingWarningNamingNoOne() {
        plannedForNine()
        val viewModel = viewModel()
        viewModel.fillIn()

        viewModel.save()

        val state = viewModel.state()
        val booking = state.doubleBooking
        assertNull(booking?.trainerName)
        assertEquals(listOf("Anna de Vries"), booking?.conflicts?.map { it.displayName })
        assertEquals(listOf(sessionIdOf("anna")), booking?.conflicts?.map { it.sessionId })
        assertNull(state.saveFailure)
        assertNull(state.saved)
        assertFalse(state.saving)
        assertEquals(anna, state.client)
        assertEquals(LocalDateTime.of(2026, 9, 24, 9, 30), state.time.start)
        assertEquals(1, sessions.sessions.size)
        assertTrue(notAllowed.isEmpty())
    }

    @Test
    fun test_F023_AC6_anOwnerPlanningForAnotherTrainerGetsTheWarningWithTheirName() {
        plannedForNine(tom)
        val viewModel = viewModel(forAnyTrainer = true, teamMemberId = john.id)
        viewModel.fillIn()
        viewModel.setTrainer(tom.id)

        viewModel.save()

        assertEquals("Tom", viewModel.state().doubleBooking?.trainerName)
    }

    @Test
    fun test_F023_AC6_anOwnerPlanningForThemselfGetsTheWarningWithoutAName() {
        plannedForNine(john)
        val viewModel = viewModel(forAnyTrainer = true, teamMemberId = john.id)
        viewModel.fillIn()

        viewModel.save()

        assertNull(viewModel.state().doubleBooking?.trainerName)
        assertEquals(1, viewModel.state().doubleBooking?.conflicts?.size)
    }

    @Test
    fun test_F023_AC6_saveAnywayPlansTheSameSessionAgainWithAllowConflictsAndOpensIt() {
        plannedForNine()
        val viewModel = viewModel()
        viewModel.fillIn()
        viewModel.save()

        viewModel.save(allowConflicts = true)

        val state = viewModel.state()
        assertNull(state.doubleBooking)
        assertNull(state.saveFailure)
        assertEquals(2, sessions.created.size)
        assertNull(sessions.created[0].second.allowConflicts)
        assertEquals(true, sessions.created[1].second.allowConflicts)
        assertEquals(sessions.created[0].second.copy(allowConflicts = true), sessions.created[1].second)
        assertEquals(LocalDateTime.of(2026, 9, 24, 9, 30), state.saved?.startsAt?.toLocalDateTime())
        assertEquals(2, sessions.sessions.size)
    }

    @Test
    fun test_F023_AC6_backClosesTheWarningKeepsTheFormAndSendsNothing() {
        plannedForNine()
        val viewModel = viewModel()
        viewModel.fillIn()
        viewModel.save()

        viewModel.dismissDoubleBooking()

        val state = viewModel.state()
        assertNull(state.doubleBooking)
        assertEquals(anna, state.client)
        assertEquals(LocalDateTime.of(2026, 9, 24, 9, 30), state.time.start)
        assertTrue(state.canSave)
        assertEquals(1, sessions.created.size)
    }

    @Test
    fun test_F023_AC7_aSessionThatStartsWhenTheOtherEndsIsNotADoubleBooking() {
        plannedForNine()
        val viewModel = viewModel()
        viewModel.fillIn(LocalTime.of(10, 0))

        viewModel.save()

        assertNull(viewModel.state().doubleBooking)
        assertNotNull(viewModel.state().saved)
    }

    @Test
    fun test_F023_AC7_aCancelledSessionIsNotADoubleBooking() {
        val cancelled = sessionOf(client = anna, trainer = sarah, status = Session.Status.CANCELLED)
        sessions.sessions[cancelled.id] = cancelled
        val viewModel = viewModel()
        viewModel.fillIn()

        viewModel.save()

        assertNull(viewModel.state().doubleBooking)
        assertNotNull(viewModel.state().saved)
    }

    @Test
    fun test_F020_AC1_aTrainerConflictWithoutSessionsSaysItWasNotSavedAndKeepsTheInput() {
        sessions.createAnswers += { sessions.trainerConflict() }
        val viewModel = viewModel()
        viewModel.chooseClient(anna)

        viewModel.save()

        assertEquals(SaveFailure.NotSaved, viewModel.state().saveFailure)
        assertNull(viewModel.state().doubleBooking)
        assertEquals(anna, viewModel.state().client)
        assertNull(viewModel.state().saved)
        assertTrue(notAllowed.isEmpty())
    }

    @Test
    fun test_F020_AC1_theApisMessageAboutATimeTheClocksSkipIsShownUnderTheTime() {
        sessions.createAnswers += { sessions.refused("localStart" to "time_does_not_exist") }
        val viewModel = viewModel()
        viewModel.chooseClient(anna)

        viewModel.save()

        assertEquals(TimeRefusal.TimeDoesNotExist, viewModel.state().time.refusal)
        assertNull(viewModel.state().saveFailure)
        viewModel.setStart(LocalTime.of(10, 0))
        assertNull(viewModel.state().time.refusal)
    }

    @Test
    fun test_F020_AC10_withNoConnectionSavingIsOffAndNothingIsQueued() {
        locations.failure = IOException("offline")
        val viewModel = viewModel()

        assertEquals(NewSessionLoad.Offline, viewModel.state().load)
        assertTrue(viewModel.state().isOffline)
        assertFalse(viewModel.state().canSave)
        viewModel.chooseClient(anna)
        viewModel.save()
        assertTrue(sessions.created.isEmpty())

        locations.failure = null
        viewModel.start()

        assertEquals(NewSessionLoad.Ready, viewModel.state().load)
        assertTrue(viewModel.state().canSave)
        assertFalse(viewModel.state().isOffline)
    }

    @Test
    fun test_F020_AC10_aSaveThatCouldNotReachTheApiTurnsSavingOffUntilItIsReadAgain() {
        val viewModel = viewModel()
        viewModel.chooseClient(anna)
        sessions.failure = IOException("offline")

        viewModel.save()

        assertTrue(viewModel.state().isOffline)
        assertFalse(viewModel.state().canSave)
        assertNull(viewModel.state().saved)
        assertNull(viewModel.state().saveFailure)
        sessions.failure = null
        viewModel.start()
        assertTrue(viewModel.state().canSave)
        assertEquals(anna, viewModel.state().client)
    }

    @Test
    fun test_F020_AC10_aWorkspaceTheApiRefusesHasNoForm() {
        locations.status = 404

        assertEquals(NewSessionLoad.NoPermission, viewModel().state().load)
    }

    @Test
    fun test_F020_AC10_anyOtherAnswerOfTheLocationsIsAFailureThatCanBeRetried() {
        locations.status = 500
        val viewModel = viewModel()
        assertEquals(NewSessionLoad.Failed, viewModel.state().load)

        locations.status = null
        viewModel.start()

        assertEquals(NewSessionLoad.Ready, viewModel.state().load)
    }

    @Test
    fun test_F020_AC1_leavingWithSomethingEnteredAsksFirst() {
        val viewModel = viewModel()
        assertFalse(viewModel.state().isDirty)

        viewModel.setNotify(false)
        assertTrue(viewModel.state().isDirty)
        viewModel.setNotify(true)
        assertFalse(viewModel.state().isDirty)
        viewModel.chooseClient(anna)
        assertTrue(viewModel.state().isDirty)
    }

    @Test
    fun test_F020_AC1_theEndOfTheSessionIsShownFromTheStartAndTheDuration() {
        val viewModel = viewModel()
        viewModel.setStart(LocalTime.of(23, 30))
        viewModel.chooseDuration(90)

        assertEquals(SessionClock.End("01:00", nextDay = true), viewModel.state().endsAt)
    }

    @Test
    fun test_F020_AC10_theClientsOwnLanguageDecidesTheLanguageOfTheConfirmation() {
        val mark = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.EN)
        val viewModel = viewModel()

        viewModel.chooseClient(mark)
        assertEquals(app.fivvi.api.models.Locale.EN, viewModel.state().emailLocale)
        viewModel.chooseClient(clientOf("Zoë Smit"))
        assertEquals(app.fivvi.api.models.Locale.NL_NL, viewModel.state().emailLocale)
    }
}
