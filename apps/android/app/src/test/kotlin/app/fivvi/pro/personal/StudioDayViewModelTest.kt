package app.fivvi.pro.personal

import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import java.io.IOException
import java.time.Instant
import java.util.UUID
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

// The Owner's Mijn dag | Hele studio (F014 AC11, Android): the control, and the workspace's day read-only from
// `GET /v1/workspaces/{id}/day` through the generated client. The API decides the day, the busiest moment and who may read
// it (`calendar.manage`); this holds the control and the answer.
@OptIn(ExperimentalCoroutinesApi::class)
class StudioDayViewModelTest {
    private val workspaces = FakeWorkspacesApi()
    private val trainers = FakeTrainersApi()
    private var clock: Instant = PersonalFixtures.now
    private val forbidden = mutableListOf<UUID>()
    private val johns = UUID.nameUUIDFromBytes("studio:john's gym".toByteArray())
    private val sarahPT = UUID.nameUUIDFromBytes("studio:sarah personal training".toByteArray())

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun model() = StudioDayViewModel(workspaces, trainers, { clock }, onForbidden = { forbidden += it })

    private fun johnWithATeam(day: app.fivvi.api.models.WorkspaceDay = StudioFixtures.johnsDay()) {
        trainers.trainers = StudioFixtures.team
        workspaces.workspaceDay = day
    }

    private fun StudioDayViewModel.studio() = apply {
        configure(johns, canManage = true)
        select(StudioScope.Studio)
    }

    // The control

    @Test
    fun test_F014_AC11_theControlShowsForAnOwnerWhoHasATeam() {
        johnWithATeam()
        val studio = model()
        assertFalse("nothing shows before the workspace is known", studio.state.value.showsToggle)

        studio.configure(johns, canManage = true)

        assertTrue("John, Owner of John's Gym with Sarah and Tom", studio.state.value.showsToggle)
        assertEquals("the default is Mijn dag", StudioScope.Mine, studio.state.value.scope)
        assertTrue("the day is read once the studio is chosen", workspaces.dayRequests.isEmpty())
    }

    @Test
    fun test_F014_AC11_aTrainerHasNoControl() {
        johnWithATeam()
        val studio = model()

        studio.configure(johns, canManage = false)
        studio.select(StudioScope.Studio)

        assertFalse("Sarah, a Trainer of John's Gym, has no calendar.manage", studio.state.value.showsToggle)
        assertFalse(studio.state.value.isStudio)
        assertTrue(workspaces.dayRequests.isEmpty())
    }

    @Test
    fun test_F014_AC11_anOwnerWithoutATeamHasNoControlAndNoStudioView() {
        trainers.trainers = listOf(StudioFixtures.john)
        workspaces.workspaceDay = StudioFixtures.johnsDay()
        val alone = model()

        alone.configure(johns, canManage = true)
        alone.select(StudioScope.Studio)

        assertFalse("a solo PT", alone.state.value.showsToggle)
        assertFalse("no studio view without a team", alone.state.value.isStudio)
        assertTrue(workspaces.dayRequests.isEmpty())
    }

    @Test
    fun test_F014_AC11_aWorkspaceWithOneTrainerHasNoControlWhoeverThatIs() {
        trainers.trainers = listOf(StudioFixtures.sarah)
        val studio = model()

        studio.configure(johns, canManage = true)

        assertFalse("one trainer is no team", studio.state.value.showsToggle)
    }

    @Test
    fun test_F014_AC11_anOwnerWhoDoesNotTrainStillHasTheControlForTheTeam() {
        trainers.trainers = listOf(StudioFixtures.sarah, StudioFixtures.tom)

        val studio = model().apply { configure(johns, canManage = true) }

        assertTrue("calendar.manage and a team, more than one trainer", studio.state.value.showsToggle)
    }

    @Test
    fun test_F014_AC11_theControlIsGoneWhenTheWorkspaceChangesToOneWithoutATeam() {
        johnWithATeam()
        val studio = model().studio()
        assertTrue(studio.state.value.isStudio)

        trainers.trainers = listOf(StudioFixtures.john)
        studio.configure(sarahPT, canManage = true)

        assertFalse(studio.state.value.showsToggle)
        assertEquals("back on Mijn dag", StudioScope.Mine, studio.state.value.scope)
        assertNull("nothing of the other workspace's day stays", studio.state.value.day)
    }

    @Test
    fun test_F014_AC11_aTeamThatCannotBeReadHidesTheControlUntilItCan() {
        johnWithATeam()
        trainers.listFailure = IOException("offline")
        val studio = model()

        studio.configure(johns, canManage = true)
        assertFalse("unknown is not shown", studio.state.value.showsToggle)

        trainers.listFailure = null
        studio.refresh()
        assertTrue(studio.state.value.showsToggle)
    }

    @Test
    fun test_F014_AC11_theControlGoesWhenCalendarManageIsLost() {
        johnWithATeam()
        val studio = model().studio()

        studio.configure(johns, canManage = false)

        assertFalse(studio.state.value.showsToggle)
        assertEquals(StudioScope.Mine, studio.state.value.scope)
        assertNull(studio.state.value.day)
    }

    // Hele studio

    @Test
    fun test_F014_AC11_heleStudioReadsTheDayOfTheCurrentWorkspaceForToday() {
        johnWithATeam()

        val studio = model().studio()

        assertEquals(TodayLoad.Loaded, studio.state.value.load)
        assertEquals(
            "one request, for the app's current workspace and today in its time zone (no date: the API's today)",
            listOf(johns to null),
            workspaces.dayRequests,
        )
        assertEquals(6, studio.state.value.day?.items?.size)
    }

    @Test
    fun test_F014_AC11_aDayThatIsNotTodayIsReadAgainWhenTheStudioIsChosen() {
        johnWithATeam()
        val studio = model().studio()
        studio.select(StudioScope.Mine)
        studio.select(StudioScope.Studio)
        assertEquals("the day on screen is today: no new read", 1, workspaces.dayRequests.size)

        clock = PersonalFixtures.at("08:35", "2026-09-23").toInstant()
        studio.select(StudioScope.Mine)
        studio.select(StudioScope.Studio)

        assertEquals("yesterday's day is not shown as today's: it is read again", 2, workspaces.dayRequests.size)
    }

    @Test
    fun test_F014_AC11_aRefusedDayHidesTheControlAndTellsTheCapabilityHelper() {
        johnWithATeam()
        workspaces.dayStatus = 403

        val studio = model().studio()

        assertEquals(listOf(johns), forbidden)
        assertFalse(studio.state.value.showsToggle)
        assertEquals(StudioScope.Mine, studio.state.value.scope)
    }

    @Test
    fun test_F014_AC11_aDayThatCannotBeReadFailsWithRetryAndOffline() {
        johnWithATeam()
        workspaces.dayFailure = IOException("offline")
        val studio = model().studio()

        assertEquals(TodayLoad.Failed, studio.state.value.load)
        assertTrue(studio.state.value.isOffline)
        assertFalse("offline has its own text, not the failure", studio.state.value.showsFailure)

        workspaces.dayFailure = null
        studio.refresh()
        assertEquals(TodayLoad.Loaded, studio.state.value.load)
        assertFalse(studio.state.value.isOffline)

        workspaces.dayStatus = 500
        studio.refresh()
        assertEquals("the day on screen stays", TodayLoad.Loaded, studio.state.value.load)
        assertTrue(studio.state.value.updateFailed)
        assertTrue(studio.state.value.showsFailure)
    }

    @Test
    fun test_F014_AC11_pullingToRefreshReadsTheDayOnlyWhileTheStudioIsOnScreen() {
        johnWithATeam()
        val studio = model().apply { configure(johns, canManage = true) }

        studio.refresh()
        assertTrue("Mijn dag is on screen: the studio's day isn't read", workspaces.dayRequests.isEmpty())

        studio.select(StudioScope.Studio)
        studio.refresh()
        assertEquals(2, workspaces.dayRequests.size)
    }
}
