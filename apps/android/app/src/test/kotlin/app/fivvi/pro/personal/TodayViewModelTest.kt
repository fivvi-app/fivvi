package app.fivvi.pro.personal

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MyDayNext
import app.fivvi.core.me.FakeMeApi
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.sessions.SessionFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
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

// TD-01 *Vandaag* (F013 AC1, AC2, AC5, AC7, AC8, AC14 and the design of DECISIONS.md §3, Android): the day across workspaces
// as `GET /v1/me/day` answers it. The texts around the content are the string catalog's and are checked, in nl-NL and en, by
// the Compose UI tests (TodayScreenTest); here is what the API's answer becomes.
@OptIn(ExperimentalCoroutinesApi::class)
class TodayViewModelTest {
    private val me = FakeMeApi()
    private val dutch = Locale.forLanguageTag("nl-NL")
    private val format = SessionFormat(dutch, PersonalRows.TIME_ZONE)
    private var clock: Instant = PersonalFixtures.now

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private var signedIn = true

    private fun model(
        store: PersonalStore = MemoryPersonalStore(),
        refreshAccount: suspend () -> List<PersonalCache.Workspace>? = { null },
        io: CoroutineDispatcher = Dispatchers.Main,
    ) = TodayViewModel(me, store, { clock }, refreshAccount, io, stillSignedIn = { signedIn })

    private fun sarahAndJohns() = PersonalCache.Workspace(PersonalFixtures.sarahPT.id, PersonalFixtures.sarahPT.name) to
        PersonalCache.Workspace(PersonalFixtures.johns.id, PersonalFixtures.johns.name)

    private fun TodayViewModel.content() = TodayContent(requireNotNull(state.value.day), state.value.now, format)

    private fun serve(day: app.fivvi.api.models.MyDay) {
        me.day = day
    }

    @Test
    fun test_F013_AC1_todayShowsMyDayAcrossWorkspaces() {
        serve(PersonalFixtures.sarah())
        val today = model()
        assertEquals(TodayLoad.Loading, today.state.value.load)

        today.load()

        val content = today.content()
        assertEquals(TodayLoad.Loaded, today.state.value.load)
        assertEquals(PersonalSummary(4, 0, "09:00", "19:00"), content.summary)
        assertEquals(25, content.next?.minutesAt(PersonalFixtures.now))
        assertEquals("Anna de Vries", content.next?.row?.title)
        assertTrue(content.next?.row?.showsWorkspace == true)
        assertEquals("Sarah Personal Training", content.next?.row?.workspaceName)
        assertEquals(listOf("Mark Jansen", "Kracht", "Kracht"), content.rows.map { it.title })
        val mark = content.rows[0]
        assertTrue(mark.namesKind)
        assertEquals("John's Gym", mark.workspaceName)
        assertEquals("John's Gym", mark.location)
        assertEquals("TrainMore Zuid", content.next?.row?.location)
        assertTrue("a class row has its own wording of the kind", content.rows[1].isGroup)
        assertTrue(content.rows[2].isCancelled)
        assertEquals(
            "one request, for today in Dutch time",
            listOf(PersonalFixtures.DAY to MeApi.SurfaceGetMyDay.ANDROID),
            me.dayRequests,
        )
    }

    @Test
    fun test_F013_AC1_inProgressReadsNuBezigAndTheCountdownFollowsTheClock() {
        serve(PersonalFixtures.sarah())
        val today = model()
        today.load()
        val next = requireNotNull(today.content().next)

        assertEquals(10, next.minutesAt(at("08:50").toInstant()))
        assertNull(next.minutesAt(at("09:05").toInstant()))
        // The server says it is in progress, whatever the phone's clock reads.
        serve(PersonalFixtures.sarah(state = MyDayNext.State.IN_PROGRESS))
        today.load()
        assertNull(requireNotNull(today.content().next).minutesAt(PersonalFixtures.now))
    }

    @Test
    fun test_F013_AC2_workspaceLabelOnlyWithSeveralWorkspaces() {
        val tom = PersonalFixtures.sarah(
            items = listOf(
                PersonalFixtures.session("gym", PersonalFixtures.johns, "09:00", "10:00", client = "Mark Jansen"),
            ),
            workspaceCount = 1,
        )
        serve(tom)
        val one = model().apply { load() }.content()
        serve(PersonalFixtures.sarah())
        val several = model().apply { load() }.content()

        assertFalse("Tom's one workspace shows no name and no dot", one.next?.row?.showsWorkspace == true)
        assertTrue((several.rows + listOfNotNull(several.next?.row)).all { it.showsWorkspace })
    }

    @Test
    fun test_F013_design_privateOnlyShowsNoKindLabelAndNoGroupFigure() {
        serve(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, PersonalFixtures.mark), workspaceCount = 1))

        val content = model().apply { load() }.content()

        assertFalse(content.next?.row?.namesKind == true)
        assertFalse(content.rows[0].namesKind)
        assertNull(content.rows[0].pill)
    }

    @Test
    fun test_F013_design_classesShowTheKindLabelAndThePill() {
        val full = PersonalFixtures.session(
            "full",
            PersonalFixtures.johns,
            "17:00",
            "18:00",
            className = "Kracht",
            booked = 8,
            capacity = 8,
        )
        serve(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, PersonalFixtures.kracht, full)))

        val content = model().apply { load() }.content()

        assertEquals(PersonalPill.Booked(0, 8), content.rows[0].pill)
        assertEquals(PersonalPill.Full, content.rows[1].pill)
        assertTrue(content.rows[0].namesKind)
    }

    @Test
    fun test_F013_design_theMijnDagCardShowsTheGapAndTheRouteWithTwoPlaces() {
        serve(PersonalFixtures.sarah())

        val card = requireNotNull(model().apply { load() }.content().card)

        val gap = requireNotNull(card.gap)
        assertEquals("12:00", gap.from)
        assertEquals("13:30", gap.to)
        assertEquals("1,5", gap.hours)
        assertEquals("Plannen opens PS-04 at the start of the gap", at("12:00"), gap.start)
        assertEquals("TrainMore Zuid → John's Gym", card.route)
    }

    @Test
    fun test_F013_design_oneOrNoPlaceAheadLeavesOutTheRouteAndNoGapSaysSo() {
        serve(PersonalFixtures.sarah(gap = null, places = listOf("John's Gym")))

        val card = requireNotNull(model().apply { load() }.content().card)

        assertNull(card.route)
        assertNull("no gap: the card says there is no free time", card.gap)
    }

    @Test
    fun test_F013_AC5_theEmptyTextsAndTheTomorrowLine() {
        serve(PersonalFixtures.empty(nextSession = "2026-10-01"))
        val none = model().apply { load() }.content()
        assertNull(none.summary)
        assertEquals(PersonalEmpty.NextSession(format.day(java.time.LocalDate.parse("2026-10-01"))), none.empty)
        assertNull(none.tomorrow)

        serve(PersonalFixtures.empty(hasSessions = false))
        assertEquals(PersonalEmpty.Never, model().apply { load() }.content().empty)

        serve(PersonalFixtures.empty(tomorrow = true))
        val nothingToday = model().apply { load() }.content()
        assertEquals(
            "with sessions tomorrow the empty text stays *Geen sessies vandaag.* and the line says the rest",
            PersonalEmpty.Today,
            nothingToday.empty,
        )
        assertEquals(PersonalTomorrow(3, "07:00", "2026-09-23"), nothingToday.tomorrow)
    }

    @Test
    fun test_F013_AC7_offlineShowsCachedDay() {
        val store = MemoryPersonalStore()
        serve(PersonalFixtures.sarah())
        model(store).load()
        me.failDayOffline()
        clock = at("08:50").toInstant()
        val later = model(store)

        later.load()

        val state = later.state.value
        assertEquals(TodayLoad.Loaded, state.load)
        assertTrue(state.isOffline)
        assertEquals("when the day was read", PersonalFixtures.now, state.updatedAt)
        assertEquals("the cached day stays on screen", 3, later.content().rows.size)
        assertFalse(state.showsFailure)

        me.recoverDay()
        later.load()
        assertFalse("back online, a refresh updates it", later.state.value.isOffline)
        assertEquals(at("08:50").toInstant(), later.state.value.updatedAt)
    }

    @Test
    fun test_F013_AC7_aFailureThatIsNotTheConnectionKeepsTheDayWithRetry() {
        serve(PersonalFixtures.sarah())
        val today = model().apply { load() }
        me.failDayWith(500)

        today.load()

        val state = today.state.value
        assertEquals(TodayLoad.Loaded, state.load)
        assertFalse(state.isOffline)
        assertTrue(state.showsFailure)
        assertEquals(3, today.content().rows.size)
    }

    @Test
    fun test_F013_AC7_withNothingKeptTheFirstFailureIsTheErrorState() {
        me.failDayWith(500)
        val today = model()

        today.load()

        assertEquals(TodayLoad.Failed, today.state.value.load)
        assertTrue(today.state.value.showsFailure)
    }

    @Test
    fun test_F013_AC7_aDayKeptForAnotherDateIsNotShown() {
        val store = MemoryPersonalStore()
        serve(PersonalFixtures.sarah())
        model(store).load()
        me.failDayOffline()
        clock = at("08:35", "2026-09-23").toInstant()

        val tomorrow = model(store).apply { load() }

        assertEquals("yesterday's day is not today's", TodayLoad.Failed, tomorrow.state.value.load)
        assertNull(tomorrow.state.value.day)
        assertTrue(tomorrow.state.value.isOffline)
    }

    @Test
    fun test_F013_AC7_oneModelOfferedAnotherDateKeepsNothingOfTheEarlierOne() {
        serve(PersonalFixtures.sarah())
        val today = model().apply { load() }
        assertEquals(PersonalFixtures.DAY, today.state.value.day?.date)

        // The phone stays open across midnight, offline: the next day has nothing kept for it.
        clock = at("00:05", "2026-09-23").toInstant()
        me.failDayOffline()
        today.load()

        assertEquals(TodayLoad.Failed, today.state.value.load)
        assertNull(today.state.value.day)
        assertTrue(today.state.value.isOffline)
        assertNull(today.state.value.updatedAt)
    }

    @Test
    fun test_F013_AC7_theErrorStateShowsOneRetryEvenAfterAnEarlierFailure() {
        clock = at("23:30").toInstant()
        serve(PersonalFixtures.sarah())
        val today = model().apply { load() }
        me.failDayWith(500)
        today.load()
        assertTrue("the day on screen stays, with the banner", today.state.value.updateFailed)

        // Offline after midnight with nothing kept for the new date: the error state has the one retry.
        clock = at("00:05", "2026-09-23").toInstant()
        me.failDayOffline()
        today.load()

        assertEquals(TodayLoad.Failed, today.state.value.load)
        assertFalse("the banner's retry is not shown next to the error state's", today.state.value.updateFailed)
    }

    @Test
    fun test_F013_AC7_aDayKeptForTheNewDateIsShownInsteadOfTheEarlierOne() {
        val store = MemoryPersonalStore()
        serve(PersonalFixtures.sarah())
        val today = model(store).apply { load() }
        // Another start of the app read the next day meanwhile, and the phone kept it.
        val nextDay = PersonalFixtures.empty().copy(date = "2026-09-23")
        clock = at("06:00", "2026-09-23").toInstant()
        me.day = nextDay
        model(store).load()

        clock = at("07:00", "2026-09-23").toInstant()
        me.failDayOffline()
        today.load()

        assertEquals(TodayLoad.Loaded, today.state.value.load)
        assertEquals("the kept day of today, not the earlier one on screen", "2026-09-23", today.state.value.day?.date)
        assertTrue(today.state.value.isOffline)
        assertTrue(today.content().rows.isEmpty())
    }

    @Test
    fun test_F013_AC8_removedWorkspaceNoticeOnce() {
        val store = MemoryPersonalStore()
        val today = model(store)
        val sarah = PersonalCache.Workspace(PersonalFixtures.sarahPT.id, PersonalFixtures.sarahPT.name)
        val johns = PersonalCache.Workspace(PersonalFixtures.johns.id, PersonalFixtures.johns.name)
        runBlocking { today.workspacesListed(listOf(sarah, johns)) }
        assertTrue("the first list has nothing to lose", today.state.value.notices.isEmpty())

        runBlocking { today.workspacesListed(listOf(sarah)) }
        assertEquals(listOf("John's Gym"), today.state.value.notices)

        today.dismissNotices()
        runBlocking { today.workspacesListed(listOf(sarah)) }
        assertTrue("it shows once", today.state.value.notices.isEmpty())
        val another = model(store)
        runBlocking { another.workspacesListed(listOf(sarah)) }
        assertTrue("also after the app starts again", another.state.value.notices.isEmpty())
    }

    @Test
    fun test_F013_AC8_aPullAsksTheAccountAgainAndShowsTheRemovedWorkspaceNotice() {
        val sarah = PersonalCache.Workspace(PersonalFixtures.sarahPT.id, PersonalFixtures.sarahPT.name)
        val johns = PersonalCache.Workspace(PersonalFixtures.johns.id, PersonalFixtures.johns.name)
        var listed: List<PersonalCache.Workspace>? = listOf(sarah, johns)
        serve(PersonalFixtures.sarah())
        val today = model(refreshAccount = { listed })
        today.refresh()
        assertTrue("the first list has nothing to lose", today.state.value.notices.isEmpty())

        listed = listOf(sarah)
        today.refresh()

        assertEquals(listOf("John's Gym"), today.state.value.notices)
        assertEquals("the day is read on each pull too", 2, me.dayRequests.size)

        today.refresh()
        assertEquals("it shows once", 1, today.state.value.notices.size)
        assertFalse(today.state.value.refreshing)
    }

    @Test
    fun test_F013_AC8_aPullWhereTheAccountCantBeReadLeavesTheNoticesAlone() {
        serve(PersonalFixtures.sarah())
        val today = model(refreshAccount = { null })

        today.refresh()

        assertTrue(today.state.value.notices.isEmpty())
        assertEquals(TodayLoad.Loaded, today.state.value.load)
    }

    // This view model outlives the sign-out in the activity's store: what arrives after it must change neither the screen nor
    // what the next account would find on the phone.
    @Test
    fun test_F013_AC7_aDayThatArrivesAfterTheSignOutChangesNeitherTheStateNorTheCache() {
        val store = MemoryPersonalStore()
        serve(PersonalFixtures.sarah())
        me.dayGate = CompletableDeferred()
        val today = model(store)
        today.load()

        signedIn = false
        store.clear()
        me.dayGate?.complete(Unit)

        assertEquals(TodayLoad.Loading, today.state.value.load)
        assertNull(today.state.value.day)
        assertNull("nothing is kept for the next account", store.read("day.json"))
    }

    @Test
    fun test_F013_AC7_aFailureThatArrivesAfterTheSignOutChangesNeitherTheStateNorTheCache() {
        val store = MemoryPersonalStore()
        me.failDayOffline()
        me.dayGate = CompletableDeferred()
        val today = model(store)
        today.load()

        signedIn = false
        me.dayGate?.complete(Unit)

        assertEquals(TodayLoad.Loading, today.state.value.load)
        assertFalse(today.state.value.isOffline)
        assertNull(store.read("day.json"))
    }

    @Test
    fun test_F013_AC7_aSignOutWhileTheDayIsBeingKeptLeavesNothingBehind() {
        val store = MemoryPersonalStore()
        serve(PersonalFixtures.sarah())
        // The sign-out comes between the check and the write: it is seen when the write is about to start.
        val signsOutFirst = object : CoroutineDispatcher() {
            override fun dispatch(context: CoroutineContext, block: Runnable) {
                signedIn = false
                block.run()
            }
        }

        model(store, io = signsOutFirst).load()

        assertNull(store.read("day.json"))
    }

    @Test
    fun test_F013_AC8_aListThatArrivesAfterTheSignOutChangesNeitherTheNoticesNorTheCache() {
        val store = MemoryPersonalStore()
        val (sarah, johns) = sarahAndJohns()
        val today = model(store)
        runBlocking { today.workspacesListed(listOf(sarah, johns)) }
        val kept = store.read("workspaces.json")

        signedIn = false
        runBlocking { today.workspacesListed(listOf(sarah)) }

        assertTrue(today.state.value.notices.isEmpty())
        assertEquals(
            "the files are as they were",
            kept?.decodeToString(),
            store.read("workspaces.json")?.decodeToString(),
        )
    }

    @Test
    fun test_F013_AC8_theListIsKeptOnTheIoDispatcher() {
        val (sarah, _) = sarahAndJohns()
        val store = MemoryPersonalStore()
        var onIo = 0
        val counting = object : CoroutineDispatcher() {
            override fun dispatch(context: CoroutineContext, block: Runnable) {
                onIo++
                block.run()
            }
        }

        runBlocking { model(store, io = counting).workspacesListed(listOf(sarah)) }

        assertEquals("the files are read and written in one step on io", 1, onIo)
        assertTrue(store.read("workspaces.json") != null)
    }

    @Test
    fun test_F013_AC14_timesInAmsterdamWithHint() {
        val newYork = ZoneId.of("America/New_York")
        serve(PersonalFixtures.sarah())
        val abroad = model().apply { load() }.content()

        assertTrue(TodayContent.showsTimeZoneHint(newYork, PersonalFixtures.now))
        assertFalse(TodayContent.showsTimeZoneHint(ZoneId.of("Europe/Amsterdam"), PersonalFixtures.now))
        assertFalse(
            "Berlin keeps Dutch time",
            TodayContent.showsTimeZoneHint(ZoneId.of("Europe/Berlin"), PersonalFixtures.now),
        )
        assertEquals("the times stay in Dutch time, whatever the phone's zone", "11:00", abroad.rows[0].startText)
        assertEquals(PersonalSummary(4, 0, "09:00", "19:00"), abroad.summary)
    }

    @Test
    fun test_F013_AC4_anItemOpensInItsOwnWorkspace() {
        serve(PersonalFixtures.sarah())

        val rows = model().apply { load() }.content().rows

        assertEquals(PersonalRoute.session(PersonalFixtures.johns.id, rows[0].id), PersonalRoute.of(rows[0]))
        assertEquals(
            "a class date opens TD-03",
            PersonalRoute.classDate(PersonalFixtures.johns.id, rows[1].id),
            PersonalRoute.of(rows[1]),
        )
    }
}
