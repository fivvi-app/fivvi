package app.fivvi.pro.sessions

import app.fivvi.api.models.Client
import app.fivvi.api.models.LocationAddress
import app.fivvi.api.models.TeamMember
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import java.io.IOException
import java.time.LocalDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// TD-02 *Privésessie* (F020 AC10 and the design): the session as the API reads it, who the person looking is among the
// trainers, and the client's language for the change email.
@OptIn(ExperimentalCoroutinesApi::class)
class SessionViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val trainers = FakeTrainersApi()
    private val team = FakeTeamApi()
    private val clients = FakeClientsApi()
    private val notAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val session = sessionOf(client = anna, trainer = sarah)

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sessions.sessions[session.id] = session
        clients.clients += anna
        trainers.trainers = listOf(sarah, tom)
        team.members = listOf(TeamMember(sarah.id, "Sarah", "trainer@example.com", TeamMember.Role.TRAINER))
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(readTeam: Boolean = false, email: String = "trainer@example.com", name: String? = "Sarah") =
        SessionViewModel(
            SessionApis(sessions, FakeLocationsApi(), trainers, team, FakeWorkspacesApi(), clients),
            workspace,
            session.id,
            readTeam,
            email,
            name,
            onNotAllowed = { notAllowed += it.code() },
        )

    @Test
    fun test_F020_AC10_theSessionOpensWithTheDataTheApiHas() {
        val state = viewModel().state.value

        assertEquals(SessionLoad.Loaded, state.load)
        assertEquals(session, state.session)
        assertEquals("Anna de Vries", state.client?.name)
        assertEquals("John's Gym", state.session?.location?.name)
    }

    @Test
    fun test_F020_AC10_aTrainerSeesThemselvesAsYouWhenTheirNameIsTheOnlyOneAmongTheTrainers() {
        val state = viewModel().state.value

        assertTrue(state.trainerIsMe)
        assertEquals(sarah.id, state.myTrainerId)
    }

    @Test
    fun test_F020_AC10_theOwnerFindsTheirPlaceByTheirAddressAndSeesAnotherTrainerByName() {
        val viewModel = viewModel(readTeam = true, email = "trainer@example.com", name = null)
        assertTrue(viewModel.state.value.trainerIsMe)

        val other = viewModel(readTeam = true, email = "owner@example.com", name = "John")
        assertFalse(other.state.value.trainerIsMe)
        assertEquals(2, team.calls)
    }

    @Test
    fun test_F020_AC10_aSessionWithoutATrainerHasNoTrainerAndNobodyIsYou() {
        sessions.sessions[session.id] = sessionOf(client = anna, trainer = null)

        val state = viewModel().state.value

        assertNull(state.session?.trainer)
        assertFalse(state.trainerIsMe)
    }

    @Test
    fun test_F020_AC6_theClientsLanguageForTheChangeEmailIsTheirOwnElseTheWorkspacesDefault() {
        assertEquals(app.fivvi.api.models.Locale.NL_NL, viewModel().state.value.emailLocale)

        val english = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.EN)
        clients.clients += english
        sessions.sessions[session.id] = sessionOf(client = english, trainer = sarah)
        assertEquals(app.fivvi.api.models.Locale.EN, viewModel().state.value.emailLocale)
    }

    @Test
    fun test_F020_AC10_aSessionTheApiDoesNotShowIsNoAccessAndAForbiddenOneTellsTheHelper() {
        sessions.getStatus = 404
        assertEquals(SessionLoad.NoPermission, viewModel().state.value.load)
        assertTrue(notAllowed.isEmpty())

        sessions.getStatus = 403
        assertEquals(SessionLoad.NoPermission, viewModel().state.value.load)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F020_AC10_noConnectionShowsTheErrorAndRetryReadsAgain() {
        sessions.failure = IOException("offline")
        val viewModel = viewModel()
        assertEquals(SessionLoad.Failed, viewModel.state.value.load)

        sessions.failure = null
        viewModel.retry()

        assertEquals(SessionLoad.Loaded, viewModel.state.value.load)
    }

    @Test
    fun test_F020_AC10_aReadThatFailsLaterLeavesWhatIsShown() {
        val viewModel = viewModel()
        sessions.failure = IOException("offline")

        viewModel.refresh()

        assertEquals(SessionLoad.Loaded, viewModel.state.value.load)
        assertEquals(session, viewModel.state.value.session)
    }

    @Test
    fun test_F020_AC6_aMoveShowsTheNewTimeAtOnceAndSaysSoUntilTheSessionChangesAgain() {
        val viewModel = viewModel()
        val moved = sessionOf(client = anna, trainer = sarah, start = LocalDateTime.of(2026, 9, 25, 10, 0), version = 2)

        viewModel.didMove(moved)

        assertEquals(moved, viewModel.state.value.session)
        assertEquals(moved, viewModel.state.value.moved)
        sessions.sessions[session.id] = moved
        viewModel.refresh()
        assertEquals(moved, viewModel.state.value.moved)

        sessions.sessions[session.id] = moved.copy(version = 3)
        viewModel.refresh()
        assertNull(viewModel.state.value.moved)
    }

    @Test
    fun test_F020_AC10_theRouteOpensTheMapsAppWithTheAddressOfTheLocation() {
        val address = LocationAddress("1011AB", "1", "A", "Damrak", "Amsterdam")

        val url = SessionRoute.url(address)

        assertEquals("https://www.google.com/maps/dir/?api=1&destination=Damrak%201%20A%2C%201011AB%20Amsterdam", url)
    }

    @Test
    fun test_F020_AC10_aLocationWithoutAnAddressHasNoRoute() {
        assertNull(SessionRoute.url(null))
        assertNull(
            viewModel().state.value.copy(session = sessionOf(client = anna, location = gymLocation(null))).routeUrl,
        )
        assertEquals(
            "https://www.google.com/maps/dir/?api=1&destination=Damrak%201%2C%201011AB%20Amsterdam",
            viewModel().state.value.routeUrl,
        )
    }
}
