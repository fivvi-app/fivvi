package app.fivvi.pro.workspace

import app.fivvi.api.models.MeWorkspace
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Synthetic IDs (AGENTS.md, D8).
private val JOHNS_GYM = UUID.fromString("00000000-0000-4000-8000-000000000001")
private val SARAH_PERSONAL_TRAINING = UUID.fromString("00000000-0000-4000-8000-000000000002")
private val THIRD = UUID.fromString("00000000-0000-4000-8000-000000000003")
private val GONE = UUID.fromString("00000000-0000-4000-8000-0000000000ff")

private fun workspace(id: UUID, name: String) =
    MeWorkspace(id, name, name.lowercase().replace(' ', '-'), MeWorkspace.Role.OWNER, emptyList())

// The API lists the workspaces by name; the pick keeps that order and holds no rule of its own (F012, spec #423).
class StartWorkspaceTest {
    private val johnsGym = workspace(JOHNS_GYM, "John's Gym")
    private val sarah = workspace(SARAH_PERSONAL_TRAINING, "Sarah Personal Training")
    private val third = workspace(THIRD, "Zumba Zone")

    @Test
    fun test_F012_AC7_theRememberedWorkspaceIsPicked() {
        assertEquals(sarah, StartWorkspace.pick(listOf(johnsGym, sarah), remembered = SARAH_PERSONAL_TRAINING))
    }

    @Test
    fun test_F012_AC5_startWorkspaceFallsBack() {
        assertEquals(johnsGym, StartWorkspace.pick(listOf(johnsGym, sarah), remembered = GONE))
    }

    @Test
    fun test_F012_AC5_withNothingRememberedTheFirstOneIsPicked() {
        assertEquals(johnsGym, StartWorkspace.pick(listOf(johnsGym, sarah), remembered = null))
    }

    @Test
    fun test_F012_AC5_withNoWorkspaceNothingIsPicked() {
        assertNull(StartWorkspace.pick(emptyList(), remembered = SARAH_PERSONAL_TRAINING))
        assertNull(StartWorkspace.pick(emptyList(), remembered = null))
    }

    // The order is the API's: only the remembered workspace moves to the front, the app does not sort again.
    @Test
    fun test_F012_AC7_orderIsTheRememberedOneThenTheOthersInTheApisOrder() {
        assertEquals(
            listOf(third, johnsGym, sarah),
            StartWorkspace.order(listOf(johnsGym, sarah, third), remembered = THIRD),
        )
        assertEquals(
            listOf(johnsGym, sarah, third),
            StartWorkspace.order(listOf(johnsGym, sarah, third), remembered = JOHNS_GYM),
        )
    }

    @Test
    fun test_F012_AC5_orderKeepsTheApisOrderWhenNothingRememberedIsListed() {
        assertEquals(listOf(sarah, johnsGym), StartWorkspace.order(listOf(sarah, johnsGym), remembered = GONE))
        assertEquals(listOf(sarah, johnsGym), StartWorkspace.order(listOf(sarah, johnsGym), remembered = null))
    }
}
