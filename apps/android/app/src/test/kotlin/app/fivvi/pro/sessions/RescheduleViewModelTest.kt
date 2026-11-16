package app.fivvi.pro.sessions

import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.ReschedulePrivateSessionRequest
import app.fivvi.api.models.Session
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.clients.clientOf
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
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

// PS-05 *Sessie verplaatsen* (F020 AC6, AC8): the move, with or without telling the client; the API decides every rule.
@OptIn(ExperimentalCoroutinesApi::class)
class RescheduleViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val notAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")

    // Thursday 24 September 2026, 09:00, a week ahead of "now".
    private val session = sessionOf(client = anna, trainer = sarah)
    private val now = Instant.parse("2026-09-17T08:00:00Z")

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sessions.clients[anna.id] = anna
        sessions.sessions[session.id] = session
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(shown: Session = session) = RescheduleViewModel(
        sessions,
        workspace,
        shown,
        Locale.NL_NL,
        onNotAllowed = { notAllowed += it.code() },
        now = { now },
    )

    private fun request(date: String, start: String, minutes: Int, notify: Boolean, version: Int = 1) =
        ReschedulePrivateSessionRequest(
            date,
            start,
            minutes,
            notify,
            version,
            ReschedulePrivateSessionRequest.Surface.ANDROID,
        )

    @Test
    fun test_F020_AC6_theFormStartsWithTheSessionAndTellsTheClientOfASessionStillToCome() {
        val state = viewModel().state.value

        assertEquals(LocalDateTime.of(2026, 9, 24, 9, 0), state.time.start)
        assertEquals(60, state.time.durationMinutes)
        assertTrue(state.notify)
    }

    @Test
    fun test_F020_AC5_aSessionInThePastDoesNotTellTheClientByDefault() {
        val past = sessionOf(client = anna, trainer = sarah, start = LocalDateTime.of(2026, 9, 1, 9, 0))

        assertFalse(viewModel(past).state.value.notify)
    }

    @Test
    fun test_F020_AC6_movingItToFridayTenWithTheClientInformedSendsTheChangeAndShowsTheMove() {
        val viewModel = viewModel()
        viewModel.setDate(LocalDate.of(2026, 9, 25))
        viewModel.setStart(LocalTime.of(10, 0))

        viewModel.save()

        assertEquals(
            listOf(Triple(workspace, session.id, request("2026-09-25", "10:00", 60, notify = true))),
            sessions.moved,
        )
        val moved = viewModel.state.value.moved
        assertNotNull(moved)
        assertEquals(
            LocalDateTime.of(2026, 9, 25, 10, 0),
            SessionClock.local(moved!!.startsAt, ZoneId.of(moved.timeZone)),
        )
        assertEquals("John's Gym", moved.location.name)
        assertEquals(2, moved.version)
    }

    @Test
    fun test_F020_AC6_withTheClientNotInformedNothingIsAskedToBeSent() {
        val viewModel = viewModel()
        viewModel.setNotify(false)
        viewModel.setStart(LocalTime.of(10, 0))

        viewModel.save()

        assertEquals(request("2026-09-24", "10:00", 60, notify = false), sessions.moved.single().third)
    }

    @Test
    fun test_F020_AC8_whenSomeoneElseChangedTheSessionFirstTheFormShowsWhoAndTheSessionAsItIsNow() {
        val theirs = sessionOf(
            client = anna,
            trainer = sarah,
            start = LocalDateTime.of(2026, 9, 24, 14, 0),
            minutes = 90,
            version = 2,
        )
        sessions.rescheduleAnswers += { _, _ -> sessions.conflict(theirs, changedBy = "Tom") }
        val viewModel = viewModel()
        viewModel.setStart(LocalTime.of(10, 0))

        viewModel.save()

        val state = viewModel.state.value
        assertEquals(RescheduleFailure.Changed("Tom"), state.failure)
        assertEquals(theirs, state.session)
        assertEquals(LocalDateTime.of(2026, 9, 24, 14, 0), state.time.start)
        assertEquals(90, state.time.durationMinutes)
        assertEquals(90, state.time.durationChoice)
        assertNull(state.moved)

        sessions.sessions[session.id] = theirs
        viewModel.save()

        assertEquals(2, sessions.moved.last().third.version)
    }

    @Test
    fun test_F020_AC8_aSessionThatWasCancelledMeanwhileCannotBeMoved() {
        val cancelled = sessionOf(client = anna, trainer = sarah, version = 2, status = Session.Status.CANCELLED)
        sessions.rescheduleAnswers += { _, _ -> sessions.conflict(cancelled, code = "session_cancelled") }
        val viewModel = viewModel()

        viewModel.save()
        assertEquals(RescheduleFailure.Cancelled, viewModel.state.value.failure)

        viewModel.save()
        assertEquals(1, sessions.moved.size)
    }

    @Test
    fun test_F020_AC6_theApisMessageAboutATimeTheClocksSkipIsShownUnderTheTime() {
        sessions.rescheduleAnswers += { _, _ -> sessions.refused("localStart" to "time_does_not_exist") }
        val viewModel = viewModel()

        viewModel.save()

        assertEquals(TimeRefusal.TimeDoesNotExist, viewModel.state.value.time.refusal)
        assertNull(viewModel.state.value.failure)
    }

    @Test
    fun test_F020_AC7_aRefusalTellsTheCapabilityHelperAndSaysSo() {
        sessions.rescheduleAnswers += { _, _ -> sessions.status(403) }
        val viewModel = viewModel()

        viewModel.save()

        assertEquals(RescheduleFailure.NoPermission, viewModel.state.value.failure)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F020_AC6_noConnectionLeavesTheFormAsItIsWithAMessage() {
        sessions.failure = IOException("offline")
        val viewModel = viewModel()
        viewModel.setStart(LocalTime.of(11, 0))

        viewModel.save()

        assertEquals(RescheduleFailure.NotSaved, viewModel.state.value.failure)
        assertEquals(LocalTime.of(11, 0), viewModel.state.value.time.start.toLocalTime())
        assertFalse(viewModel.state.value.saving)
        assertNull(viewModel.state.value.moved)
    }
}
