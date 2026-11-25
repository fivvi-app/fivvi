package app.fivvi.pro.home

import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.me.teamMemberIdOf
import app.fivvi.core.me.workspaceIdOf
import org.junit.Assert.assertEquals
import org.junit.Test

// F068 AC11 (spec AC1): the word of the workspace shown follows the account's latest list.
class WorkspaceWordTest {
    private val shown = HomeDestination.Workspace(
        "John's Gym",
        workspaceIdOf("John's Gym"),
        teamMemberIdOf("John's Gym"),
        TrainerWord.TRAINER,
    )

    private fun listed(name: String, word: TrainerWord) = MeWorkspace(
        workspaceIdOf(name),
        name,
        "slug",
        word,
        MeWorkspace.Role.OWNER,
        teamMemberIdOf(name),
        MeWorkspace.Capabilities.values().toList(),
    )

    @Test
    fun test_F068_AC11_theListedWordReplacesTheOneThePersonLoadedWith() {
        val list = listOf(listed("Sarah PT", TrainerWord.COACH), listed("John's Gym", TrainerWord.INSTRUCTEUR))

        assertEquals(TrainerWord.INSTRUCTEUR, shown.withListedWord(list).trainerWord)
    }

    @Test
    fun test_F068_AC11_noListYetOrNotOnItKeepsTheWordItLoadedWith() {
        assertEquals(shown, shown.withListedWord(null))
        assertEquals(shown, shown.withListedWord(listOf(listed("Sarah PT", TrainerWord.COACH))))
    }
}
