package app.fivvi.pro.classes

import app.fivvi.api.models.SessionSeries
import app.fivvi.api.models.Trainer
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import java.io.IOException
import java.time.DayOfWeek
import java.time.LocalDateTime
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

// TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of DECISIONS.md §3): a class on a date as the team reads it.
@OptIn(ExperimentalCoroutinesApi::class)
class ClassDateViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val sarah = trainerOf("Sarah")
    private val john = trainerOf("John")
    private val notAllowed = mutableListOf<Int>()
    private val cancelNotAllowed = mutableListOf<Int>()
    private val mobility = groupClassOf(
        "Mobility",
        nameEn = "Mobility flow",
        descriptionNl = "Rustig bewegen en rekken.",
        descriptionEn = "Gentle moving and stretching.",
        trainer = sarah,
    )

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun date(
        groupClass: app.fivvi.api.models.GroupClass = mobility,
        trainer: Trainer? = sarah,
        booked: Int = 0,
        cancelled: Int = 0,
    ): UUID {
        classes.classes[groupClass.id] = groupClass
        val date = classDateOf(UUID.randomUUID(), groupClass, trainer, booked = booked, cancelled = cancelled)
        sessions.sessions[date.id] = date
        return date.id
    }

    private fun viewModel(id: UUID, teamMemberId: UUID = john.id, canManage: Boolean = true, added: Int? = null) =
        ClassDateViewModel(
            ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi()),
            workspace,
            id,
            teamMemberId,
            canManage,
            added,
            onNotAllowed = { notAllowed += it.code() },
        )

    @Test
    fun test_F021_AC3_theDateShowsTheNameTheTimeTheLocationTheTrainerAndThePlaces() {
        val state = viewModel(date(booked = 3, cancelled = 1)).state.value

        assertEquals(ClassDateLoad.Loaded, state.load)
        assertEquals("Mobility", state.title(english = false))
        assertEquals("John's Gym", state.session?.location?.name)
        assertEquals("Sarah", state.session?.trainer?.name)
        assertEquals(3, state.booked)
        assertEquals(12, state.capacity)
        assertEquals(9, state.free)
        assertFalse(state.showsNoBookings)
    }

    @Test
    fun test_F021_AC3_aDateWithoutBookingsSaysSo() {
        val state = viewModel(date()).state.value

        assertTrue(state.showsNoBookings)
        assertEquals(12, state.free)
    }

    @Test
    fun test_F021_AC5_aDateWithoutATrainerHasNone() {
        val state = viewModel(date(trainer = null)).state.value

        assertNull(state.session?.trainer)
        assertFalse(state.trainerIsMe)
    }

    @Test
    fun test_F021_AC3_theTrainerIsToldFromThePersonByTheTeamMemberId() {
        val id = date()

        assertTrue(viewModel(id, teamMemberId = sarah.id).state.value.trainerIsMe)
        assertFalse(viewModel(id, teamMemberId = john.id).state.value.trainerIsMe)
    }

    @Test
    fun test_F021_AC3_theNameIsInTheViewersLanguageElseDutch() {
        val named = viewModel(date()).state.value
        val unnamed = viewModel(date(groupClassOf("Yoga"))).state.value

        assertEquals("Mobility flow", named.title(english = true))
        assertEquals("Mobility", named.title(english = false))
        assertEquals("Yoga", unnamed.title(english = true))
    }

    @Test
    fun test_F021_design_theDescriptionIsInTheViewersLanguageElseDutchMarkedAsDutch() {
        val state = viewModel(date()).state.value

        assertEquals(ClassText("Rustig bewegen en rekken.", false), state.description(english = false))
        assertEquals(ClassText("Gentle moving and stretching.", false), state.description(english = true))

        val dutchOnly = viewModel(date(groupClassOf("Yoga", descriptionNl = "Rustig."))).state.value
        assertEquals(ClassText("Rustig.", true), dutchOnly.description(english = true))
        assertEquals(ClassText("Rustig.", false), dutchOnly.description(english = false))
    }

    @Test
    fun test_F021_design_aClassWithoutADescriptionShowsNone() {
        val state = viewModel(date(groupClassOf("Yoga", descriptionNl = "", descriptionEn = ""))).state.value

        assertNull(state.description(english = false))
        assertNull(state.description(english = true))
    }

    @Test
    fun test_F021_design_theDescriptionOpensWithMeerAndClosesWithMinder() {
        val viewModel = viewModel(date())
        assertFalse(viewModel.state.value.descriptionOpen)

        viewModel.toggleDescription()
        assertTrue(viewModel.state.value.descriptionOpen)
        viewModel.toggleDescription()
        assertFalse(viewModel.state.value.descriptionOpen)
    }

    @Test
    fun test_F021_design_theOwnerHasTheMenuWhoseEditSaysTheClassIsManagedOnTheWeb() {
        val viewModel = viewModel(date())
        assertTrue(viewModel.state.value.hasMenu)
        assertFalse(viewModel.state.value.manageOnWeb)

        viewModel.editTapped()

        assertTrue(viewModel.state.value.manageOnWeb)
    }

    @Test
    fun test_F021_design_aTrainerHasNoMenu() {
        assertFalse(viewModel(date(), teamMemberId = sarah.id, canManage = false).state.value.hasMenu)
    }

    @Test
    fun test_F021_AC6_aDateJustAddedSaysSo() {
        assertEquals(1, viewModel(date(), added = 1).state.value.added)
        assertNull(viewModel(date()).state.value.added)
    }

    // F022 AC6: a date in a weekly series says Onderdeel van: {class}, elke {weekday} {time}, from the series the API sends.
    private fun weeklyDate(trainer: Trainer? = sarah, weekly: Boolean = true): UUID {
        classes.classes[mobility.id] = mobility
        val series = SessionSeries(
            UUID.randomUUID(),
            SessionSeries.Weekday.TH,
            "18:00",
            "2026-09-24",
            emptyList(),
        )
        val date = classDateOf(UUID.randomUUID(), mobility, trainer, series = series.takeIf { weekly })
        sessions.sessions[date.id] = date
        return date.id
    }

    @Test
    fun test_F022_AC6_aDateInASeriesSaysOnderdeelVanTheClassEveryWeekdayAndTime() {
        val state = viewModel(weeklyDate()).state.value

        val line = state.seriesLine(english = false)
        assertEquals(SeriesLine("Mobility", "18:00", DayOfWeek.THURSDAY), line)
        assertEquals("Mobility flow", state.seriesLine(english = true)?.name)
    }

    @Test
    fun test_F022_AC6_theSeriesLineKeepsTheWallClockTimeOfTheSeriesAfterTheClocksChange() {
        classes.classes[mobility.id] = mobility
        // 18:00 in Amsterdam after the clocks went back (17:00 UTC): the series still says 18:00.
        val series = SessionSeries(UUID.randomUUID(), SessionSeries.Weekday.TU, "18:00", "2026-10-27", emptyList())
        val date = classDateOf(
            UUID.randomUUID(),
            mobility,
            sarah,
            start = LocalDateTime.of(2026, 10, 27, 18, 0),
            series = series,
        )
        sessions.sessions[date.id] = date

        val line = viewModel(date.id).state.value.seriesLine(english = false)

        assertEquals("18:00", line?.time)
        assertEquals(DayOfWeek.TUESDAY, line?.weekday)
    }

    @Test
    fun test_F022_AC6_aDateOnItsOwnHasNoSeriesLine() {
        assertNull(viewModel(weeklyDate(weekly = false)).state.value.seriesLine(english = false))
    }

    @Test
    fun test_F022_AC6_aTrainerReadsTheSeriesLineToo() {
        val state = viewModel(weeklyDate(), teamMemberId = sarah.id, canManage = false).state.value

        assertNotNull(state.seriesLine(english = false))
    }

    @Test
    fun test_F022_AC6_aNewWeeklyClassOpensWithTwelveGroepslessenToegevoegd() {
        val id = weeklyDate()

        assertEquals(12, viewModel(id, added = 12).state.value.added)
        assertEquals(1, viewModel(id, added = 1).state.value.added)
        assertNull("opened from the calendar: no confirmation", viewModel(id).state.value.added)
    }

    @Test
    fun test_F021_AC3_aDateTheApiRefusesHasNoScreenAnd403TellsTheCapabilityHelper() {
        sessions.getStatus = 403
        val forbidden = viewModel(date()).state.value
        sessions.getStatus = 404
        val gone = viewModel(date()).state.value

        assertEquals(ClassDateLoad.NoPermission, forbidden.load)
        assertEquals(ClassDateLoad.NoPermission, gone.load)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F021_AC3_aReadThatFailsCanBeRetriedAndALaterOneThatFailsKeepsWhatIsShown() {
        val id = date()
        sessions.failure = IOException("offline")
        val viewModel = viewModel(id)
        assertEquals(ClassDateLoad.Failed, viewModel.state.value.load)

        sessions.failure = null
        viewModel.retry()
        assertEquals(ClassDateLoad.Loaded, viewModel.state.value.load)

        sessions.failure = IOException("offline")
        viewModel.refresh()
        assertEquals(ClassDateLoad.Loaded, viewModel.state.value.load)
        assertEquals("Mobility", viewModel.state.value.title(english = false))
    }

    @Test
    fun test_F021_AC3_theDescriptionIsOnlyToWordTheScreenSoAFailedReadOfTheClassChangesNothing() {
        val id = date()
        classes.getStatus = 500

        val state = viewModel(id).state.value

        assertEquals(ClassDateLoad.Loaded, state.load)
        assertEquals("Mobility", state.title(english = false))
        assertNull(state.description(english = false))
    }

    private fun cancellable(id: UUID, isOnline: () -> Boolean = { true }, onCancelled: () -> Unit = {}) =
        ClassDateViewModel(
            ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi()),
            workspace,
            id,
            john.id,
            canManage = true,
            isOnline = isOnline,
            onCancelled = onCancelled,
            onNotAllowed = { notAllowed += it.code() },
            onCancelNotAllowed = { cancelNotAllowed += it.code() },
        )

    @Test
    fun test_F026_AC5_onlyTheOwnerMayCancelADateThatIsStillPlanned() {
        val id = date()

        assertTrue(viewModel(id).state.value.canCancel)
        assertFalse(viewModel(id, canManage = false).state.value.canCancel)
        val cancelled = viewModel(id).state.value.session?.copy(status = app.fivvi.api.models.Session.Status.CANCELLED)
        assertFalse(viewModel(id).state.value.copy(session = cancelled).canCancel)
        assertFalse(viewModel(id).state.value.copy(session = cancelled).hasMenu)
    }

    @Test
    fun test_F026_AC6_theConfirmationSaysHowManyBookedClientsGetAnEmail() {
        val viewModel = cancellable(date(booked = 3, cancelled = 1))

        viewModel.askToCancel()

        assertEquals(CancelAsk(participants = 3, started = false), viewModel.state.value.cancelAsk)
        viewModel.dismissCancel()
        assertNull(viewModel.state.value.cancelAsk)
        assertTrue(classes.cancelled.isEmpty())
    }

    @Test
    fun test_F026_AC8_withoutParticipantsNobodyGetsAnEmail() {
        val viewModel = cancellable(date())

        viewModel.askToCancel()

        assertEquals(CancelAsk(participants = 0, started = false), viewModel.state.value.cancelAsk)
    }

    @Test
    fun test_F026_AC9_aDateThatHasStartedIsRecordedWithoutEmails() {
        classes.previewStarted = true
        val viewModel = cancellable(date(booked = 3))

        viewModel.askToCancel()

        assertEquals(CancelAsk(participants = 0, started = true), viewModel.state.value.cancelAsk)
    }

    @Test
    fun test_F026_design_confirmingCancelsThisDateOnlyWithTheVersionSeenAndTellsTheLists() {
        val id = date(booked = 3)
        var told = 0
        val viewModel = cancellable(id, onCancelled = { told++ })
        viewModel.askToCancel()

        viewModel.confirmCancel()

        val (inWorkspace, sent, request) = classes.cancelled.single()
        assertEquals(workspace, inWorkspace)
        assertEquals(id, sent)
        assertEquals(
            app.fivvi.api.models.CancelClassDateRequest(
                scope = app.fivvi.api.models.CancelClassDateRequest.Scope.THIS,
                version = 1,
                surface = app.fivvi.api.models.CancelClassDateRequest.Surface.ANDROID,
            ),
            request,
        )
        val state = viewModel.state.value
        assertNull(state.cancelAsk)
        assertTrue(state.isCancelled)
        assertEquals("Sarah", state.session?.cancellation?.cancelledBy?.name)
        assertFalse(state.hasMenu)
        assertEquals(1, told)
    }

    @Test
    fun test_F026_AC4_offlineByTheNetworkNothingIsAskedAndTheItemIsOff() {
        val viewModel = cancellable(date(booked = 3), isOnline = { false })

        viewModel.askToCancel()

        assertTrue(classes.previewed.isEmpty())
        assertNull(viewModel.state.value.cancelAsk)
        assertTrue(viewModel.state.value.copy(online = false).isOffline)
        assertFalse(viewModel.state.value.copy(online = false).canStartCancel)
    }

    @Test
    fun test_F026_AC4_aRequestThatCannotReachTheApiIsTheFallbackForOffline() {
        val id = date(booked = 3)
        val viewModel = cancellable(id)
        classes.failure = IOException("offline")

        viewModel.askToCancel()

        assertTrue(viewModel.state.value.isOffline)
        assertFalse(viewModel.state.value.canStartCancel)
        assertNull(viewModel.state.value.cancelAsk)
    }

    @Test
    fun test_F026_AC11_aDateChangedFirstSaysWhoAndShowsItAsItIsNow() {
        val id = date(booked = 3)
        val viewModel = cancellable(id)
        viewModel.askToCancel()
        sessions.sessions[id] = sessions.sessions.getValue(id).copy(version = 2)

        viewModel.confirmCancel()

        assertEquals(CancelFailure.Changed("Tom"), viewModel.state.value.cancelFailure)
        assertEquals(2, viewModel.state.value.session?.version)
        assertFalse(viewModel.state.value.isCancelled)
    }

    // The cancel calls are guarded by class.manage: their 403 goes to their own callback, so the capability that
    // drops is class.manage (ClassDateFlow), not the one of the read.
    @Test
    fun test_F026_AC5_aRefusedCancelPreviewTellsTheCancelCallbackAndSaysThePersonMayNot() {
        val id = date(booked = 3)
        val viewModel = cancellable(id)
        classes.previewStatus = 403

        viewModel.askToCancel()

        assertEquals(CancelFailure.NoPermission, viewModel.state.value.cancelFailure)
        assertEquals(listOf(403), cancelNotAllowed)
        assertTrue(notAllowed.isEmpty())
    }

    @Test
    fun test_F026_AC5_aRefusedCancellationTellsTheCancelCallbackAndSaysThePersonMayNot() {
        val id = date(booked = 3)
        val viewModel = cancellable(id)
        viewModel.askToCancel()
        classes.cancelStatus = 403

        viewModel.confirmCancel()

        assertEquals(CancelFailure.NoPermission, viewModel.state.value.cancelFailure)
        assertFalse(viewModel.state.value.isCancelling)
        assertEquals(listOf(403), cancelNotAllowed)
        assertTrue(notAllowed.isEmpty())
    }
}
