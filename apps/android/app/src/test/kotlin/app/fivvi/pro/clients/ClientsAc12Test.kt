package app.fivvi.pro.clients

import app.fivvi.api.models.Client
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.home.workspaceIdOf
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
import org.junit.Before
import org.junit.Test

// F006 AC12 (Android): one trainer's way through the three screens against one API: the list and the search show the
// clients the API holds, *+ Nieuwe klant* adds one with the rules of AC1 to AC3, and the overview shows and edits the
// same fields. The wording of every message is the screens' own and is proven in the Compose tests, in both languages.
@OptIn(ExperimentalCoroutinesApi::class)
class ClientsAc12Test {
    private val scheduler = TestCoroutineScheduler()
    private val api = FakeClientsApi()
    private val workspace = workspaceIdOf("John's Gym")

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))
        api.clients += listOf(clientOf("Anna de Vries", "anna@example.com"), clientOf("Mark Jansen"))
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun test_F006_AC12_listSearchAddEdit() {
        // The list and the search.
        val list = ClientsViewModel(api, FakeWorkspacesApi(), workspace, debounce = 300.milliseconds)
        scheduler.runCurrent()
        assertEquals(
            listOf("Anna de Vries", "Mark Jansen"),
            (list.state.value as ClientsState.Loaded).clients.map(Client::name),
        )
        list.onQueryChange("vrie")
        scheduler.advanceTimeBy(301)
        scheduler.runCurrent()
        assertEquals(listOf("Anna de Vries"), (list.state.value as ClientsState.Loaded).clients.map(Client::name))

        // Add one with a name only (AC1), then the same address again (AC3).
        val add = AddClientViewModel(api, workspace, app.fivvi.api.models.Locale.NL_NL)
        add.onNameChange("Carla Bos")
        add.onEmailChange("Carla@Example.com")
        add.submit()
        scheduler.runCurrent()
        val carla = add.state.value.added!!
        assertEquals("carla@example.com", carla.email)
        api.addAnswers += { api.exists(carla.id) }
        val again = AddClientViewModel(api, workspace, app.fivvi.api.models.Locale.NL_NL)
        again.onNameChange("Carla")
        again.onEmailChange("carla@example.com")
        again.submit()
        scheduler.runCurrent()
        assertEquals(Duplicate(carla.id, "Carla Bos"), again.state.value.duplicate)
        assertEquals(3, api.clients.size)

        // The overview shows and edits the same fields.
        val profile = ClientProfileViewModel(api, workspace, carla.id)
        scheduler.runCurrent()
        profile.startEdit()
        profile.onNameChange("Carla Bos-Smit")
        profile.save()
        scheduler.runCurrent()
        assertEquals("Carla Bos-Smit", (profile.state.value as ClientProfileState.Loaded).client.name)

        // The list shows the change from the next load.
        list.onQueryChange("")
        scheduler.advanceTimeBy(301)
        scheduler.runCurrent()
        assertEquals(
            listOf("Anna de Vries", "Carla Bos-Smit", "Mark Jansen"),
            (list.state.value as ClientsState.Loaded).clients.map(Client::name),
        )
    }
}
