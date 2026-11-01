package app.fivvi.pro.capabilities

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE
import app.fivvi.api.models.MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW
import app.fivvi.api.models.MeWorkspace.Capabilities.WORKSPACE_PERIOD_MANAGE
import app.fivvi.api.models.MeWorkspace.Role
import app.fivvi.api.models.MyWorkspace
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.ProfileRole
import app.fivvi.pro.home.ProfileState
import app.fivvi.pro.home.ProfileViewModel
import app.fivvi.pro.home.ProfileWorkspace
import app.fivvi.pro.home.workspaceIdOf
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceCapabilitiesTest {
    private val api = FakeMeApi()
    private val helper = WorkspaceCapabilities(api)

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val johnsGym = workspaceIdOf("John's Gym")
    private val personalTraining = workspaceIdOf("Sarah Personal Training")

    private fun workspace(name: String, role: Role, vararg capabilities: MeWorkspace.Capabilities) =
        MeWorkspace(workspaceIdOf(name), name, name.lowercase().replace(' ', '-'), role, capabilities.toList())

    private fun account(vararg workspaces: MeWorkspace) = MeResponse(
        id = UUID.randomUUID(),
        email = "sarah@example.com",
        name = "Sarah",
        preferredLocale = MeResponse.PreferredLocale.NL_NL,
        canCreateWorkspace = false,
        workspaces = workspaces.toList(),
    )

    private fun answerAccount(vararg workspaces: MeWorkspace) {
        api.answers += { Response.success(account(*workspaces)) }
    }

    private fun forbidden() = Response.error<Unit>(403, "{}".toResponseBody())

    // F004 AC10: an action guarded by clients.manage is shown when the API lists it for the workspace, and not when it doesn't.
    @Test
    fun test_F004_AC10_newClientActionFollowsCapability() {
        helper.replace(
            listOf(
                workspace("John's Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW, CLIENTS_PERIOD_MANAGE),
                workspace("Read Only Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW),
            ),
        )

        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
        assertFalse(helper.mayShow(workspaceIdOf("Read Only Gym"), CLIENTS_PERIOD_MANAGE))
        assertTrue(helper.mayShow(workspaceIdOf("Read Only Gym"), CLIENTS_PERIOD_VIEW))
    }

    @Test
    fun test_F004_AC10_nothingShowsBeforeTheApiHasAnswered() {
        assertFalse(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
    }

    @Test
    fun test_F004_AC10_aWorkspaceTheApiDidNotListShowsNothing() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE)))

        assertFalse(helper.mayShow(workspaceIdOf("Fit Studio"), CLIENTS_PERIOD_MANAGE))
    }

    @Test
    fun test_F004_AC10_aNewAnswerReplacesTheOldOne() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, WORKSPACE_PERIOD_MANAGE, CLIENTS_PERIOD_MANAGE)))

        helper.replace(listOf(workspace("John's Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW)))

        assertFalse(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
        assertFalse(helper.mayShow(johnsGym, WORKSPACE_PERIOD_MANAGE))
    }

    @Test
    fun test_F004_AC10_aWorkspaceListedTwiceDoesNotCrash() {
        helper.replace(
            listOf(
                workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE),
                workspace("John's Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW),
            ),
        )

        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_VIEW))
    }

    // F004 AC8: Sarah is Trainer of John's Gym and Owner of Sarah Personal Training. Profiel shows the API's role of each,
    // and the helper answers for each workspace on its own, with no role name in the app.
    @Test
    fun test_F004_AC8_roleLabelsPerWorkspace() {
        api.answerWorkspaces(
            Triple("John's Gym", "johns-gym", MyWorkspace.Role.TRAINER),
            Triple("Sarah Personal Training", "sarah-personal-training", MyWorkspace.Role.OWNER),
        )
        val profile = ProfileViewModel(api)

        helper.replace(
            listOf(
                workspace("John's Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW, CLIENTS_PERIOD_MANAGE),
                workspace(
                    "Sarah Personal Training",
                    Role.OWNER,
                    WORKSPACE_PERIOD_MANAGE,
                    CLIENTS_PERIOD_VIEW,
                    CLIENTS_PERIOD_MANAGE,
                ),
            ),
        )

        assertEquals(
            ProfileState.Loaded(
                listOf(
                    ProfileWorkspace("johns-gym", "John's Gym", ProfileRole.Trainer),
                    ProfileWorkspace("sarah-personal-training", "Sarah Personal Training", ProfileRole.Owner),
                ),
            ),
            profile.state.value,
        )
        assertTrue(helper.mayShow(personalTraining, WORKSPACE_PERIOD_MANAGE))
        assertFalse(helper.mayShow(johnsGym, WORKSPACE_PERIOD_MANAGE))
        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
        assertTrue(helper.mayShow(personalTraining, CLIENTS_PERIOD_MANAGE))
    }

    // F004: a 403 means the list on the phone is out of date. The action is hidden at once and the account is read again.
    @Test
    fun test_F004_forbiddenHidesTheActionAndRefreshesTheCapabilities() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_VIEW, CLIENTS_PERIOD_MANAGE)))
        // The refresh finds the person is a trainer without client rights now.
        answerAccount(workspace("John's Gym", Role.TRAINER, CLIENTS_PERIOD_VIEW))

        helper.onResponse(forbidden(), johnsGym, CLIENTS_PERIOD_MANAGE)

        assertEquals(1, api.calls)
        assertFalse(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_VIEW))
    }

    @Test
    fun test_F004_aRefreshThatListsTheCapabilityShowsTheActionAgain() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE)))
        answerAccount(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE))

        helper.onResponse(forbidden(), johnsGym, CLIENTS_PERIOD_MANAGE)

        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
    }

    @Test
    fun test_F004_forbiddenHidesTheActionEvenWhenTheRefreshFails() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE)))
        api.answers += { throw IOException("offline") }

        helper.onResponse(forbidden(), johnsGym, CLIENTS_PERIOD_MANAGE)

        assertEquals(1, api.calls)
        assertFalse(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
    }

    @Test
    fun test_F004_otherAnswersChangeNothing() {
        helper.replace(listOf(workspace("John's Gym", Role.OWNER, CLIENTS_PERIOD_MANAGE)))

        helper.onResponse(Response.success(Unit), johnsGym, CLIENTS_PERIOD_MANAGE)
        helper.onResponse(Response.error<Unit>(404, "{}".toResponseBody()), johnsGym, CLIENTS_PERIOD_MANAGE)

        assertEquals(0, api.calls)
        assertTrue(helper.mayShow(johnsGym, CLIENTS_PERIOD_MANAGE))
    }
}
