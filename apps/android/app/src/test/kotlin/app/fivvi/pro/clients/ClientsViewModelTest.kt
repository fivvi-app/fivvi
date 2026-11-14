package app.fivvi.pro.clients

import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.quarantine.Permission
import app.fivvi.pro.home.FakeWorkspacesApi
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

// TM-02 Klanten (F006 AC6, AC12): the list and the search come from the API, and a list that was read stays on screen,
// with the time it was read, when the next read fails (information-architecture.md §9.5, offline).
@OptIn(ExperimentalCoroutinesApi::class)
class ClientsViewModelTest {
    private val scheduler = TestCoroutineScheduler()
    private val api = FakeClientsApi()
    private val workspaces = FakeWorkspacesApi()
    private val workspace = workspaceIdOf("John's Gym")
    private val refused = mutableListOf<Int>()
    private var now = Instant.parse("2026-11-02T07:42:00Z")

    private val anna = clientOf("Anna de Vries", "anna@example.com")
    private val mark = clientOf("Mark Jansen")

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))
        api.clients += listOf(mark, anna)
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = ClientsViewModel(
        api,
        workspaces,
        workspace,
        onNotAllowed = { refused += it.code() },
        clock = { now },
        debounce = 300.milliseconds,
    ).also { scheduler.runCurrent() }

    private fun ClientsViewModel.loaded() = state.value as ClientsState.Loaded

    @Test
    fun test_F006_AC12_listsTheWorkspacesClientsSortedByName() {
        val viewModel = viewModel()

        assertEquals(listOf(anna, mark), viewModel.loaded().clients)
        assertEquals(2, viewModel.loaded().total)
        assertFalse(viewModel.loaded().offline)
        assertEquals(listOf<String?>(null), api.searches)
    }

    @Test
    fun test_F006_AC12_showsLoadingUntilTheFirstAnswer() {
        val viewModel = ClientsViewModel(api, workspaces, workspace)

        assertEquals(ClientsState.Loading, viewModel.state.value)
    }

    @Test
    fun test_F006_AC6_searchAsYouTypeAsksTheApiOnceTheTypingPauses() {
        val viewModel = viewModel()

        viewModel.onQueryChange("v")
        viewModel.onQueryChange("vri")
        viewModel.onQueryChange("vrie")
        scheduler.advanceTimeBy(299)
        scheduler.runCurrent()
        assertEquals(listOf<String?>(null), api.searches)
        scheduler.advanceTimeBy(2)
        scheduler.runCurrent()

        assertEquals(listOf<String?>(null, "vrie"), api.searches)
        assertEquals(listOf(anna), viewModel.loaded().clients)
        assertEquals("vrie", viewModel.query.value)
    }

    @Test
    fun test_F006_AC6_clearingTheSearchListsEveryoneAgain() {
        val viewModel = viewModel()
        viewModel.onQueryChange("vrie")
        scheduler.advanceTimeBy(301)
        scheduler.runCurrent()

        viewModel.onQueryChange("")
        scheduler.advanceTimeBy(301)
        scheduler.runCurrent()

        assertEquals(listOf(anna, mark), viewModel.loaded().clients)
        // A blank search is no search parameter.
        assertEquals(null, api.searches.last())
    }

    @Test
    fun test_F006_AC12_aListReadBeforeStaysWithItsTimeWhenTheNextReadFails() {
        val viewModel = viewModel()
        now = Instant.parse("2026-11-02T08:00:00Z")
        api.failure = IOException("offline")

        viewModel.refresh()
        scheduler.runCurrent()

        val loaded = viewModel.loaded()
        assertEquals(listOf(anna, mark), loaded.clients)
        assertTrue(loaded.offline)
        assertEquals(Instant.parse("2026-11-02T07:42:00Z"), loaded.updatedAt)
        assertFalse(viewModel.refreshing.value)
    }

    @Test
    fun test_F006_AC12_aFailedSearchKeepsTheListOnScreen() {
        val viewModel = viewModel()
        api.failure = IOException("offline")

        viewModel.onQueryChange("vrie")
        scheduler.advanceTimeBy(301)
        scheduler.runCurrent()

        assertEquals(listOf(anna, mark), viewModel.loaded().clients)
        assertTrue(viewModel.loaded().offline)
    }

    @Test
    fun test_F006_AC12_theFirstReadFailingShowsTheErrorAndRetryTriesAgain() {
        api.failure = IOException("offline")
        val viewModel = viewModel()
        assertEquals(ClientsState.Failed, viewModel.state.value)

        api.failure = null
        viewModel.retry()
        scheduler.runCurrent()

        assertEquals(listOf(anna, mark), viewModel.loaded().clients)
    }

    @Test
    fun test_F006_AC12_pullToRefreshReadsTheListAgainAndKeepsItWhileItLoads() {
        val viewModel = viewModel()
        api.clients += clientOf("Carla Bos")

        viewModel.refresh()
        assertTrue(viewModel.refreshing.value)
        assertEquals(2, viewModel.loaded().clients.size)
        scheduler.runCurrent()

        assertFalse(viewModel.refreshing.value)
        assertEquals(listOf("Anna de Vries", "Carla Bos", "Mark Jansen"), viewModel.loaded().clients.map(Client::name))
    }

    @Test
    fun test_F006_AC12_moreClientsThanThePageAreCountedSoTheScreenCanSaySo() {
        api.total = 120

        val viewModel = viewModel()

        assertEquals(120, viewModel.loaded().total)
        assertEquals(2, viewModel.loaded().clients.size)
    }

    @Test
    @Permission
    fun test_F006_AC10_aRefusedListShowsNoAccessAndTellsTheCapabilityHelper() {
        api.listStatus = 403

        val viewModel = viewModel()

        assertEquals(ClientsState.NoAccess, viewModel.state.value)
        assertEquals(listOf(403), refused)
    }

    @Test
    fun test_F006_AC12_theWorkspaceDefaultsNameTheDefaultLanguageAndTheClock() {
        val viewModel = viewModel()
        // Without an answer of its own, the workspace is Dutch and in Amsterdam time (the product default).
        assertEquals(Locale.NL_NL, viewModel.workspace.value.defaultLocale)
        assertEquals(ZoneId.of("Europe/Amsterdam"), viewModel.workspace.value.zone)
        assertEquals(listOf(workspace), workspaces.requested)
    }

    @Test
    fun test_F006_AC12_aWorkspaceThatCantBeReadKeepsTheDefaults() {
        workspaces.answers += { throw IOException("offline") }

        val viewModel = viewModel()

        assertEquals(Locale.NL_NL, viewModel.workspace.value.defaultLocale)
        assertEquals(ZoneId.of("Europe/Amsterdam"), viewModel.workspace.value.zone)
        assertTrue(viewModel.state.value is ClientsState.Loaded)
    }

    @Test
    fun test_F006_AC12_theWorkspaceFromTheApiSetsLanguageAndZone() {
        workspaces.answers += {
            Response.success(
                app.fivvi.api.models.Workspace(
                    it,
                    "Fit Studio",
                    "fit-studio",
                    Locale.EN,
                    "Europe/London",
                    TrainerWord.TRAINER,
                ),
            )
        }

        val viewModel = viewModel()

        assertEquals(Locale.EN, viewModel.workspace.value.defaultLocale)
        assertEquals(ZoneId.of("Europe/London"), viewModel.workspace.value.zone)
    }
}
