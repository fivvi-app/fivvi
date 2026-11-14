package app.fivvi.pro.home

import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.MyWorkspace.Role
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.quarantine.Permission
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTest {
    private val api = FakeMeApi()
    private val trainers = FakeTrainersApi()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val gym = Triple("John's Gym", "johns-gym", Role.TRAINER)
    private val personalTraining = Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER)

    private fun viewModel() = ProfileViewModel(api, trainers)

    private fun workspace(
        name: String,
        slug: String,
        role: ProfileRole,
        trainsHere: Boolean = false,
        canSwitchTrainsHere: Boolean = role == ProfileRole.Owner,
    ) = ProfileWorkspace(workspaceIdOf(name), slug, name, role, trainsHere, canSwitchTrainsHere)

    // F003 AC9: Sarah is Trainer of John's Gym and Owner of Sarah Personal Training; both are listed, each with its role.
    // The label of each role, in both locales, is checked in ProfileScreenTest.
    @Test
    fun test_F003_AC9_profileListsWorkspacesWithRole() {
        api.answerAccount(name = "Sarah", email = "trainer@example.com")
        api.answerWorkspaces(gym, personalTraining)

        val viewModel = viewModel()

        assertEquals(
            ProfileState.Loaded(
                name = "Sarah",
                email = "trainer@example.com",
                workspaces = listOf(
                    workspace("John's Gym", "johns-gym", ProfileRole.Trainer, trainsHere = true),
                    workspace("Sarah Personal Training", "sarah-personal-training", ProfileRole.Owner),
                ),
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun test_F003_AC9_offlineShowsRetry() {
        api.answerAccount()
        api.answerAccount()
        api.workspaceAnswers += { throw IOException("offline") }
        api.answerWorkspaces(gym)
        val viewModel = viewModel()
        assertEquals(ProfileState.Failed, viewModel.state.value)

        viewModel.retry()

        assertEquals(
            listOf(workspace("John's Gym", "johns-gym", ProfileRole.Trainer, trainsHere = true)),
            (viewModel.state.value as ProfileState.Loaded).workspaces,
        )
    }

    @Test
    fun test_F003_AC9_foregroundReadsTheListAgainAndKeepsItWhileItLoads() {
        api.answerAccount()
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)
        api.answerWorkspaces(personalTraining)
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(2, api.workspaceCalls)
        assertEquals(
            listOf(workspace("Sarah Personal Training", "sarah-personal-training", ProfileRole.Owner)),
            (viewModel.state.value as ProfileState.Loaded).workspaces,
        )
    }

    @Test
    fun test_F003_AC9_noConnectionOnForegroundKeepsTheList() {
        api.answerAccount()
        api.answerAccount()
        api.answerWorkspaces(gym)
        api.workspaceAnswers += { throw IOException("offline") }
        val viewModel = viewModel()
        val before = viewModel.state.value

        viewModel.refresh()

        assertEquals(before, viewModel.state.value)
    }

    private fun openWithSarah(): ProfileViewModel {
        api.answerAccount(name = "Sarah", email = "trainer@example.com")
        api.answerWorkspaces(gym, personalTraining)
        return viewModel()
    }

    // F005 AC1: Profiel shows the name and the email address; editing the name and saving updates Profiel.
    @Test
    fun test_F005_AC1_editNameUpdatesProfile() {
        val viewModel = openWithSarah()
        assertEquals("Sarah", (viewModel.state.value as ProfileState.Loaded).name)
        assertEquals("trainer@example.com", (viewModel.state.value as ProfileState.Loaded).email)

        viewModel.startEditingName()
        assertEquals(NameEditor(input = "Sarah"), viewModel.editor.value)
        viewModel.onNameInput("Sarah de Vries")
        viewModel.saveName()

        assertEquals(listOf("Sarah de Vries"), api.updates.map { it.name })
        assertNull(api.updates.single().preferredLocale)
        assertNull(viewModel.editor.value)
        val state = viewModel.state.value as ProfileState.Loaded
        assertEquals("Sarah de Vries", state.name)
        assertEquals("trainer@example.com", state.email)
        assertTrue(state.nameSaved)
    }

    // F005 AC1: an empty or blank name is refused with a field message (the API decides), and the input stays.
    @Test
    fun test_F005_AC1_emptyNameIsRefusedWithAFieldMessage() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("   ")
        api.refuseNextUpdate(code = "too_small")

        viewModel.saveName()

        assertEquals(NameEditor(input = "   ", error = NameError.Required), viewModel.editor.value)
        assertEquals("Sarah", (viewModel.state.value as ProfileState.Loaded).name)
    }

    // F005 AC1: a name over 80 characters is refused with its own field message.
    @Test
    fun test_F005_AC1_tooLongNameIsRefusedWithAFieldMessage() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("x".repeat(81))
        api.refuseNextUpdate(code = "too_big")

        viewModel.saveName()

        assertEquals(NameEditor(input = "x".repeat(81), error = NameError.TooLong), viewModel.editor.value)
    }

    // F005 AC1: a failed save keeps what was typed; typing again clears the message; the next save can go through.
    @Test
    fun test_F005_AC1_failedSaveKeepsTheInput() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("Sarah de Vries")
        api.updateFailure = IOException("offline")

        viewModel.saveName()

        assertEquals(NameEditor(input = "Sarah de Vries", error = NameError.NoConnection), viewModel.editor.value)
        assertEquals("Sarah", (viewModel.state.value as ProfileState.Loaded).name)

        viewModel.onNameInput("Sarah de Vries-Jansen")
        assertEquals(NameEditor(input = "Sarah de Vries-Jansen"), viewModel.editor.value)
        api.updateFailure = null
        viewModel.saveName()

        assertNull(viewModel.editor.value)
        assertEquals("Sarah de Vries-Jansen", (viewModel.state.value as ProfileState.Loaded).name)
    }

    @Test
    fun test_F005_AC1_aServerErrorIsAGenericMessageAndKeepsTheInput() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("Sarah de Vries")
        api.updateAnswers += { retrofit2.Response.error(500, "{}".toResponseBody()) }

        viewModel.saveName()

        assertEquals(NameEditor(input = "Sarah de Vries", error = NameError.Failed), viewModel.editor.value)
    }

    @Test
    fun test_F005_AC1_cancelLeavesTheNameAsItWas() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("Someone else")

        viewModel.cancelEditingName()

        assertNull(viewModel.editor.value)
        assertTrue(api.updates.isEmpty())
        assertEquals("Sarah", (viewModel.state.value as ProfileState.Loaded).name)
    }

    @Test
    fun test_F005_AC1_foregroundKeepsWhatIsBeingTyped() {
        val viewModel = openWithSarah()
        viewModel.startEditingName()
        viewModel.onNameInput("Sarah de")
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)

        viewModel.refresh()

        assertEquals(NameEditor(input = "Sarah de"), viewModel.editor.value)
    }

    // F005 AC4: an Owner switches training off and on for the workspace; the screen follows what the API accepted.
    @Test
    fun test_F005_AC4_ownerSwitchesTrainingOffAndOn() {
        api.answerAccount()
        api.answerWorkspaces(trainingOwners = setOf("Sarah Personal Training"), gym, personalTraining)
        val viewModel = viewModel()
        assertTrue(
            (viewModel.state.value as ProfileState.Loaded).workspaces.single {
                it.slug == "sarah-personal-training"
            }.trainsHere,
        )

        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = false)

        assertEquals(listOf(workspaceIdOf("Sarah Personal Training") to false), trainers.switches)
        var workspace = (viewModel.state.value as ProfileState.Loaded).workspaces.single {
            it.slug ==
                "sarah-personal-training"
        }
        assertFalse(workspace.trainsHere)
        assertEquals(TrainsHereChange.Saved, workspace.change)

        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = true)

        assertEquals(
            listOf(workspaceIdOf("Sarah Personal Training") to false, workspaceIdOf("Sarah Personal Training") to true),
            trainers.switches,
        )
        workspace =
            (viewModel.state.value as ProfileState.Loaded).workspaces.single { it.slug == "sarah-personal-training" }
        assertTrue(workspace.trainsHere)
        // The other workspace did not change.
        assertEquals(
            workspace("John's Gym", "johns-gym", ProfileRole.Trainer, trainsHere = true),
            (viewModel.state.value as ProfileState.Loaded).workspaces.single { it.slug == "johns-gym" },
        )
    }

    // F005 AC4: a switch that could not be saved is back as it was, with a message.
    @Test
    fun test_F005_AC4_aFailedSwitchGoesBackWithAMessage() {
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)
        val viewModel = viewModel()
        trainers.failure = { throw IOException("offline") }

        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = true)

        var workspace = (viewModel.state.value as ProfileState.Loaded).workspaces.single {
            it.slug ==
                "sarah-personal-training"
        }
        assertFalse(workspace.trainsHere)
        assertEquals(TrainsHereChange.NoConnection, workspace.change)

        trainers.refuse(500)
        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = true)

        workspace =
            (viewModel.state.value as ProfileState.Loaded).workspaces.single { it.slug == "sarah-personal-training" }
        assertFalse(workspace.trainsHere)
        assertEquals(TrainsHereChange.Failed, workspace.change)
    }

    // F005 AC5: the switch follows the capability team.manage the API lists, never the role: where it is not listed (the
    // Trainer of John's Gym) there is no switch and the app never asks for it.
    @Test
    fun test_F005_AC5_noSwitchWhereIAmTrainer() {
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)
        val viewModel = viewModel()

        val rows = (viewModel.state.value as ProfileState.Loaded).workspaces.associate {
            it.slug to
                it.canSwitchTrainsHere
        }
        assertEquals(mapOf("johns-gym" to false, "sarah-personal-training" to true), rows)

        viewModel.setTrainsHere(workspaceIdOf("John's Gym"), on = false)

        assertTrue(trainers.switches.isEmpty())
    }

    // F004 AC10: an Owner the API lists without team.manage has no switch, a Trainer with it has one: the role decides nothing.
    @Test
    @Permission
    fun test_F004_AC10_theSwitchFollowsTheCapabilityNotTheRole() {
        api.answerAccount()
        api.answerWorkspaces(
            trainingOwners = emptySet(),
            gym,
            personalTraining,
            capabilities = mapOf(
                "John's Gym" to listOf(MyWorkspace.Capabilities.TEAM_PERIOD_MANAGE),
                "Sarah Personal Training" to listOf(MyWorkspace.Capabilities.TEAM_PERIOD_VIEW),
            ),
        )
        val viewModel = viewModel()

        val rows = (viewModel.state.value as ProfileState.Loaded).workspaces.associate {
            it.slug to it.canSwitchTrainsHere
        }
        assertEquals(mapOf("johns-gym" to true, "sarah-personal-training" to false), rows)

        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = true)
        assertTrue(trainers.switches.isEmpty())

        viewModel.setTrainsHere(workspaceIdOf("John's Gym"), on = false)
        assertEquals(listOf(workspaceIdOf("John's Gym") to false), trainers.switches)
    }

    // A foreground read while a switch is being saved keeps the row saving (switch disabled) until the API has answered.
    @Test
    fun test_F005_AC4_foregroundDuringASwitchSaveKeepsItSaving() {
        api.answerAccount()
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)
        api.answerWorkspaces(gym, personalTraining)
        val viewModel = viewModel()
        val gate = CompletableDeferred<Unit>()
        trainers.gate = gate
        val id = workspaceIdOf("Sarah Personal Training")
        viewModel.setTrainsHere(id, on = true)

        viewModel.refresh()

        fun row() = (viewModel.state.value as ProfileState.Loaded).workspaces.single { it.id == id }
        assertEquals(TrainsHereChange.Saving, row().change)
        viewModel.setTrainsHere(id, on = false)
        assertEquals(listOf(id to true), trainers.switches)

        gate.complete(Unit)

        assertEquals(TrainsHereChange.Saved, row().change)
        assertTrue(row().trainsHere)
    }

    // F005 AC5: the API refuses a Trainer's switch (403) or a lost place (404): the list is read again.
    @Test
    @Permission
    fun test_F005_AC5_aRefusedSwitchReadsTheListAgain() {
        api.answerAccount()
        api.answerAccount()
        api.answerWorkspaces(gym, personalTraining)
        api.answerWorkspaces(gym)
        val viewModel = viewModel()
        trainers.refuse(404)

        viewModel.setTrainsHere(workspaceIdOf("Sarah Personal Training"), on = true)

        assertEquals(listOf("johns-gym"), (viewModel.state.value as ProfileState.Loaded).workspaces.map { it.slug })
    }
}
