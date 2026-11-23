package app.fivvi.pro.personal

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.PersonalSession
import app.fivvi.core.me.FakeMeApi
import app.fivvi.pro.personal.PersonalFixtures.at
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
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

// TD-04 *Agenda* (F013 AC5, AC6, AC7, AC15 and the design of DECISIONS.md §3, Android): the week and the month as
// `GET /v1/me/sessions` answers them. What a view writes down of the answer is checked by AgendaContentTest, the words
// around it by the Compose UI tests (AgendaScreenTest) in nl-NL and en.
@OptIn(ExperimentalCoroutinesApi::class)
class AgendaViewModelTest {
    private val me = FakeMeApi()
    private var clock: Instant = PersonalFixtures.now
    private var signedIn = true

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun day(text: String) = LocalDate.parse(text)

    private fun range(from: String, until: String) = AgendaRange(day(from), day(until))

    private fun serve(items: List<PersonalSession> = PersonalFixtures.septemberWeek) {
        me.sessions = items
    }

    private fun model(store: PersonalStore = MemoryPersonalStore(), io: CoroutineDispatcher = Dispatchers.Main) =
        AgendaViewModel(me, store, { clock }, io, stillSignedIn = { signedIn })

    private val AgendaViewModel.current get() = state.value

    // 22 September 2026 is a Tuesday: the week of Monday 21 to Sunday 27.
    @Test
    fun test_F013_AC15_aWeekRendersFromOneRequest() {
        serve()
        val agenda = model()
        assertEquals(AgendaLoad.Loading, agenda.current.load)

        agenda.load()

        assertEquals(AgendaLoad.Loaded, agenda.current.load)
        assertEquals(
            "one request for the seven days, from this app, so the API records the view of the calendar",
            listOf(Triple("2026-09-21", "2026-09-27", MeApi.SurfaceListMySessions.ANDROID)),
            me.sessionRequests,
        )

        agenda.select(day("2026-09-24"))
        agenda.show(AgendaMode.Day)
        agenda.show(AgendaMode.Week)
        assertEquals(range("2026-09-21", "2026-09-27"), agenda.current.range)
        assertEquals("no request per day, none for the view of the same days", 1, me.sessionRequests.size)
    }

    @Test
    fun test_F013_AC15_theMonthIsOneRequestForTheDaysOfItsGrid() {
        serve()
        val agenda = model()
        agenda.show(AgendaMode.Month)

        agenda.load()

        assertEquals("1 September 2026 is a Tuesday", "2026-08-31", me.sessionRequests.single().first)
        assertEquals("2026-10-04", me.sessionRequests.single().second)
        assertEquals(35, agenda.current.visibleDays.size)
        assertTrue("never more than 42 days", agenda.current.visibleDays.size <= 42)
    }

    @Test
    fun test_F013_design_theWeekIsTheFirstViewAndTodayTheSelectedDay() {
        val agenda = model()

        assertEquals(AgendaMode.Week, agenda.current.mode)
        assertEquals(day("2026-09-22"), agenda.current.selectedDay)
    }

    @Test
    fun test_F013_AC5_openingOnTomorrowSelectsTheDayWithoutAnotherRequest() {
        serve()
        val agenda = model()
        agenda.load()

        agenda.open(day("2026-09-23"))

        assertEquals(day("2026-09-23"), agenda.current.selectedDay)
        assertEquals("tomorrow is in the week on screen", 1, me.sessionRequests.size)
    }

    @Test
    fun test_F013_AC5_openingOnTomorrowShowsTheWeekWhateverViewWasOpen() {
        val agenda = model()
        agenda.show(AgendaMode.Month)

        agenda.open(day("2026-09-23"))

        assertEquals("Morgen opens the week view, as the prototype does", AgendaMode.Week, agenda.current.mode)
        assertEquals(day("2026-09-23"), agenda.current.selectedDay)
        agenda.show(AgendaMode.Day)
        agenda.open(day("2026-09-23"))
        assertEquals("from Dag too", AgendaMode.Week, agenda.current.mode)
    }

    @Test
    fun test_F013_AC5_aDayInAnotherWeekReadsThatWeek() {
        serve()
        val agenda = model()
        agenda.load()

        agenda.open(day("2026-09-29"))

        assertEquals(range("2026-09-28", "2026-10-04"), agenda.current.range)
        agenda.load()
        assertEquals(listOf("2026-09-21", "2026-09-28"), me.sessionRequests.map { it.first })
    }

    @Test
    fun test_F013_AC6_aMonthIsSteppedWithItsGridRange() {
        serve()
        val agenda = model()
        agenda.show(AgendaMode.Month)
        agenda.load()

        agenda.stepMonth(1)
        agenda.load()
        assertEquals(day("2026-10-22"), agenda.current.selectedDay)
        assertEquals("2026-09-28", me.sessionRequests.last().first)
        assertEquals("2026-11-01", me.sessionRequests.last().second)

        agenda.stepMonth(-2)
        assertEquals(day("2026-08-22"), agenda.current.selectedDay)
    }

    @Test
    fun test_F013_design_aWeekIsSteppedBySevenDaysAndVandaagJumpsBack() {
        serve()
        val agenda = model()
        agenda.load()

        agenda.stepWeek(-1)
        assertEquals(day("2026-09-15"), agenda.current.selectedDay)
        assertEquals(range("2026-09-14", "2026-09-20"), agenda.current.range)
        agenda.goToToday()
        assertEquals("Vandaag jumps back", day("2026-09-22"), agenda.current.selectedDay)
        assertEquals(range("2026-09-21", "2026-09-27"), agenda.current.range)
    }

    @Test
    fun test_F013_AC7_offlineShowsTheLastResponseOfTheRange() {
        val store = MemoryPersonalStore()
        serve()
        model(store).load()
        me.failSessionsOffline()
        clock = at("08:50").toInstant()
        val later = model(store)

        later.load()

        assertEquals(AgendaLoad.Loaded, later.current.load)
        assertTrue(later.current.isOffline)
        assertEquals("the time the phone read it", PersonalFixtures.now, later.current.updatedAt)
        assertEquals(4, AgendaContent(later.current, clock, TestFormat.dutch).rows(day("2026-09-22")).size)
        assertFalse(later.current.showsFailure)

        me.recoverSessions()
        later.load()
        assertFalse(later.current.isOffline)
        assertEquals(clock, later.current.updatedAt)
    }

    @Test
    fun test_F013_AC7_aRangeNothingIsKeptForIsTheErrorState() {
        val store = MemoryPersonalStore()
        serve()
        model(store).load()
        me.failSessionsOffline()
        val other = model(store)
        other.open(day("2026-11-10"))

        other.load()

        assertEquals(AgendaLoad.Failed, other.current.load)
        assertTrue(other.current.isOffline)
        assertFalse("offline has its own words, not the failure", other.current.showsFailure)
    }

    @Test
    fun test_F013_AC7_aFailureThatIsNotTheConnectionKeepsTheWeekWithRetry() {
        serve()
        val agenda = model()
        agenda.load()
        me.failSessionsWith(500)

        agenda.load()

        assertEquals(AgendaLoad.Loaded, agenda.current.load)
        assertFalse(agenda.current.isOffline)
        assertTrue(agenda.current.updateFailed)
        assertTrue(agenda.current.showsFailure)
        assertEquals(4, AgendaContent(agenda.current, clock, TestFormat.dutch).rows(day("2026-09-22")).size)
    }

    @Test
    fun test_F013_AC7_withNothingKeptTheFirstFailureIsTheErrorState() {
        me.failSessionsWith(500)
        val agenda = model()

        agenda.load()

        assertEquals(AgendaLoad.Failed, agenda.current.load)
        assertTrue(agenda.current.showsFailure)
        assertFalse(agenda.current.updateFailed)

        me.recoverSessions()
        serve()
        agenda.load()
        assertEquals(AgendaLoad.Loaded, agenda.current.load)
    }

    @Test
    fun test_F013_AC7_theLastSixRangesAreKeptForTheOfflineView() {
        val store = MemoryPersonalStore()
        serve()
        val reader = model(store)
        (0..7).forEach { week ->
            reader.open(day("2026-09-22").plusWeeks(week.toLong()))
            reader.load()
        }
        me.failSessionsOffline()
        val offline = model(store)

        offline.open(day("2026-09-22"))
        offline.load()
        assertEquals("the first two weeks are no longer kept", AgendaLoad.Failed, offline.current.load)
        offline.open(day("2026-11-10"))
        offline.load()
        assertEquals("the sixth newest is", AgendaLoad.Loaded, offline.current.load)
        assertTrue(offline.current.isOffline)
    }

    @Test
    fun test_F013_AC7_anAnswerAfterTheSignOutIsDroppedAndKeptNowhere() {
        val store = MemoryPersonalStore()
        serve()
        val agenda = model(store)
        me.sessionsGate = CompletableDeferred()
        agenda.load()
        signedIn = false

        me.sessionsGate?.complete(Unit)

        assertEquals("nothing arrives for the next account", AgendaLoad.Loading, agenda.current.load)
        assertTrue(PersonalCache(store).sessions.isEmpty())
    }

    @Test
    fun test_F013_AC7_aFreshAnswerIsKept() {
        val store = MemoryPersonalStore()
        serve()

        model(store).load()

        val kept = PersonalCache(store).sessions.single()
        assertEquals(day("2026-09-21"), kept.from)
        assertEquals(day("2026-09-27"), kept.until)
        assertEquals(PersonalFixtures.now, kept.savedAt)
    }

    @Test
    fun test_F013_design_aReadThatCameBackForAnotherRangeIsNotTheOneOnScreen() {
        serve()
        val agenda = model()
        me.sessionsGate = CompletableDeferred()
        agenda.load()
        agenda.stepWeek(1)

        me.sessionsGate?.complete(Unit)

        assertNull("the week on screen was not read", agenda.current.read)
        assertEquals(AgendaLoad.Loading, agenda.current.load)
    }
}
