package app.fivvi.pro.sessions

import app.fivvi.api.models.CancelPrivateSessionRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.Session
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.clients.clientOf
import java.io.IOException
import java.time.Instant
import java.time.LocalDateTime
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

// PS-06 *Sessie annuleren?* (F026 AC1, AC1a, AC2, AC4): who cancels, the question about another time, the email box and what
// the API answers.
@OptIn(ExperimentalCoroutinesApi::class)
class CancelSessionViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val notAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")
    private val session = sessionOf(client = anna, trainer = sarah)

    // Tuesday 22 September 2026, 08:35 in Amsterdam: two days before the session.
    private val before = LocalDateTime.of(2026, 9, 22, 8, 35).atZone(ZoneId.of("Europe/Amsterdam")).toInstant()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sessions.sessions[session.id] = session
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(from: Session = session, canReschedule: Boolean = true, now: Instant = before) =
        CancelSessionViewModel(
            sessions,
            workspace,
            from,
            "Anna de Vries",
            "anna@example.com",
            Locale.NL_NL,
            canReschedule,
            now,
            onNotAllowed = { notAllowed += it.code() },
        )

    @Test
    fun test_F026_AC1a_withTheClientCancellingTheQuestionAboutAnotherTimeComesFirst() {
        val viewModel = viewModel()

        assertEquals(CancelInitiator.Client, viewModel.state.value.initiator)
        assertEquals(CancelStep.Nudge, viewModel.state.value.step)
        assertFalse(viewModel.state.value.canSubmit)

        viewModel.cancelAnyway()

        assertEquals(CancelStep.Confirm, viewModel.state.value.step)
        assertTrue(viewModel.state.value.canSubmit)
    }

    @Test
    fun test_F026_AC1a_weGoStraightToTheConfirmStepAndSoDoesAPersonWhoMayNotMoveSessions() {
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)
        assertEquals(CancelStep.Confirm, viewModel.state.value.step)

        assertEquals(CancelStep.Confirm, viewModel(canReschedule = false).state.value.step)
    }

    @Test
    fun test_F026_AC2_theEmailBoxFollowsWhoCancelsAndCanBeChanged() {
        val viewModel = viewModel()
        assertFalse(viewModel.state.value.notify)

        viewModel.choose(CancelInitiator.Workspace)
        assertTrue(viewModel.state.value.notify)

        viewModel.setNotify(false)
        assertFalse(viewModel.state.value.notify)

        viewModel.choose(CancelInitiator.Client)
        assertFalse(viewModel.state.value.notify)
    }

    @Test
    fun test_F026_AC4_weCancelAndTheApiGetsTheInitiatorTheEmailChoiceTheVersionAndTheSurface() {
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)

        viewModel.cancel()

        val (inWorkspace, id, request) = sessions.cancelled.single()
        assertEquals(workspace, inWorkspace)
        assertEquals(session.id, id)
        assertEquals(
            CancelPrivateSessionRequest(
                CancelPrivateSessionRequest.Initiator.WORKSPACE,
                notify = true,
                version = 1,
                surface = CancelPrivateSessionRequest.Surface.ANDROID,
            ),
            request,
        )
        val cancelled = viewModel.state.value.cancelled
        assertNotNull(cancelled)
        assertEquals(Session.Status.CANCELLED, cancelled?.status)
        assertEquals("Sarah", cancelled?.cancellation?.cancelledBy?.name)
    }

    @Test
    fun test_F026_AC1_theClientCancellingSendsNoEmailUnlessTheBoxIsSwitchedOn() {
        val viewModel = viewModel()
        viewModel.cancelAnyway()

        viewModel.cancel()

        assertEquals(CancelPrivateSessionRequest.Initiator.CLIENT, sessions.cancelled.single().third.initiator)
        assertFalse(sessions.cancelled.single().third.notify)
    }

    @Test
    fun test_F026_AC9_aSessionThatHasStartedSendsNothingWhateverTheBoxSaid() {
        val started = viewModel(now = session.startsAt.toInstant().plusSeconds(60))
        started.choose(CancelInitiator.Workspace)
        assertTrue(started.state.value.started)

        started.cancel()

        assertFalse(sessions.cancelled.single().third.notify)
    }

    @Test
    fun test_F026_AC11_aSessionChangedFirstSaysWhoAndShowsItAsItIsNow() {
        val moved = session.copy(version = 2)
        sessions.sessions[session.id] = moved
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)

        viewModel.cancel()

        assertEquals(CancelFailure.Changed("Tom"), viewModel.state.value.failure)
        assertEquals(moved, viewModel.state.value.session)
        assertNull(viewModel.state.value.cancelled)
        // The next try uses the version it shows.
        viewModel.cancel()
        assertEquals(2, sessions.cancelled.last().third.version)
        assertNotNull(viewModel.state.value.cancelled)
    }

    @Test
    fun test_F026_AC11_aSessionCancelledFirstSaysSoAndCannotBeCancelledAgain() {
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)
        val cancelled = session.copy(status = Session.Status.CANCELLED)
        sessions.cancelAnswers += { _, _ -> sessions.conflict(cancelled, code = "session_cancelled") }

        viewModel.cancel()

        assertEquals(CancelFailure.Cancelled, viewModel.state.value.failure)
        assertEquals(Session.Status.CANCELLED, viewModel.state.value.session.status)
        assertFalse(viewModel.state.value.canSubmit)
    }

    @Test
    fun test_F026_AC5_aRefusalTellsTheHelperAndSaysThePersonMayNotCancel() {
        sessions.cancelAnswers += { _, _ -> sessions.status(403) }
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)

        viewModel.cancel()

        assertEquals(CancelFailure.NoPermission, viewModel.state.value.failure)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F026_AC4_noConnectionSaysOfflineQueuesNothingAndTurnsTheButtonOff() {
        sessions.failure = IOException("offline")
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)

        viewModel.cancel()

        assertEquals(CancelFailure.Offline, viewModel.state.value.failure)
        assertTrue(viewModel.state.value.isOffline)
        assertFalse(viewModel.state.value.canSubmit)
        assertFalse(viewModel.state.value.saving)
        // Choosing again doesn't take the offline line away: the phone is still offline.
        viewModel.choose(CancelInitiator.Client)
        assertEquals(CancelFailure.Offline, viewModel.state.value.failure)
    }

    @Test
    fun test_F026_AC4_anyOtherFailureSaysNotSavedAndTheButtonStaysOn() {
        sessions.cancelAnswers += { _, _ -> sessions.status(500) }
        val viewModel = viewModel()
        viewModel.choose(CancelInitiator.Workspace)

        viewModel.cancel()

        assertEquals(CancelFailure.NotSaved, viewModel.state.value.failure)
        assertTrue(viewModel.state.value.canSubmit)
    }
}
