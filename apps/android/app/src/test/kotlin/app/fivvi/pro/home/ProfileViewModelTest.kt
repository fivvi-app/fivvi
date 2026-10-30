package app.fivvi.pro.home

import app.fivvi.api.models.MyWorkspace.Role
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTest {
    private val api = FakeMeApi()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val gym = Triple("John's Gym", "johns-gym", Role.TRAINER)
    private val personalTraining = Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER)

    // F003 AC9: Sarah is Trainer of John's Gym and Owner of Sarah Personal Training; both are listed, each with its role.
    // The label of each role, in both locales, is checked in ProfileScreenTest.
    @Test
    fun test_F003_AC9_profileListsWorkspacesWithRole() {
        api.answerWorkspaces(gym, personalTraining)

        val viewModel = ProfileViewModel(api)

        assertEquals(
            ProfileState.Loaded(
                listOf(
                    ProfileWorkspace("johns-gym", "John's Gym", ProfileRole.Trainer),
                    ProfileWorkspace("sarah-personal-training", "Sarah Personal Training", ProfileRole.Owner),
                ),
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun test_F003_AC9_offlineShowsRetry() {
        api.workspaceAnswers += { throw IOException("offline") }
        api.answerWorkspaces(gym)
        val viewModel = ProfileViewModel(api)
        assertEquals(ProfileState.Failed, viewModel.state.value)

        viewModel.retry()

        assertEquals(
            ProfileState.Loaded(listOf(ProfileWorkspace("johns-gym", "John's Gym", ProfileRole.Trainer))),
            viewModel.state.value,
        )
    }

    @Test
    fun test_F003_AC6_foregroundReadsTheListAgainAndKeepsItWhileItLoads() {
        api.answerWorkspaces(gym, personalTraining)
        api.answerWorkspaces(personalTraining)
        val viewModel = ProfileViewModel(api)

        viewModel.refresh()

        assertEquals(2, api.workspaceCalls)
        assertEquals(
            ProfileState.Loaded(
                listOf(ProfileWorkspace("sarah-personal-training", "Sarah Personal Training", ProfileRole.Owner)),
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun test_F003_AC6_noConnectionOnForegroundKeepsTheList() {
        api.answerWorkspaces(gym)
        api.workspaceAnswers += { throw IOException("offline") }
        val viewModel = ProfileViewModel(api)
        val before = viewModel.state.value

        viewModel.refresh()

        assertEquals(before, viewModel.state.value)
    }
}
