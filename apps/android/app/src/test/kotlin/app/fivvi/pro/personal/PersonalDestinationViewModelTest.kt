package app.fivvi.pro.personal

import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.me.teamMemberIdOf
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.home.WorkspacesRead
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// A row of Vandaag opens in the workspace of its item (F013 AC4): the person's own member ID and capabilities there are read
// from the account, without changing the current workspace; when they can't be read the screen says why.
@OptIn(ExperimentalCoroutinesApi::class)
class PersonalDestinationViewModelTest {
    private val johns = workspace("John's Gym", MeWorkspace.Role.TRAINER)
    private val sarahPT = workspace("Sarah Personal Training", MeWorkspace.Role.OWNER)

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun workspace(name: String, role: MeWorkspace.Role) = MeWorkspace(
        workspaceIdOf(name),
        name,
        "slug",
        TrainerWord.TRAINER,
        role,
        teamMemberIdOf(name),
        emptyList(),
    )

    @Test
    fun test_F013_AC4_theItemsWorkspaceIsReadFromTheAccountBeforeTheScreenOpens() {
        val model = PersonalDestinationViewModel(johns.id, { listOf(sarahPT, johns) }, { error("no read needed") })

        assertEquals(PersonalDestinationViewModel.State.Ready(johns), model.state.value)
    }

    @Test
    fun test_F013_AC4_aWorkspaceThePersonIsNotOnIsNotTheTextOfVandaagFailing() {
        val model = PersonalDestinationViewModel(johns.id, { listOf(sarahPT) }, { error("no read needed") })

        assertEquals(PersonalDestinationViewModel.State.Unavailable, model.state.value)
    }

    @Test
    fun test_F013_AC4_withoutAConnectionTheScreenSaysSoAndOpnieuwReadsItAgain() {
        var reads: WorkspacesRead = WorkspacesRead.Offline
        val model = PersonalDestinationViewModel(johns.id, { emptyList() }, { reads })
        assertEquals(PersonalDestinationViewModel.State.Offline, model.state.value)

        reads = WorkspacesRead.Listed(listOf(sarahPT, johns))
        model.retry()

        assertEquals(PersonalDestinationViewModel.State.Ready(johns), model.state.value)
    }

    @Test
    fun test_F013_AC4_opnieuwAsksTheAccountAgainWhenItsWorkspacesWereNotLoaded() {
        var asked = 0
        val model = PersonalDestinationViewModel(johns.id, { emptyList() }) {
            asked++
            WorkspacesRead.Failed
        }
        assertEquals("the account is asked when the screen opens", 1, asked)
        assertEquals(PersonalDestinationViewModel.State.Unavailable, model.state.value)

        model.retry()

        assertEquals(2, asked)
        assertTrue(model.state.value is PersonalDestinationViewModel.State.Unavailable)
    }
}
