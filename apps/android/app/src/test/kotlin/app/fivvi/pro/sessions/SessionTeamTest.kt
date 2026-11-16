package app.fivvi.pro.sessions

import app.fivvi.api.models.TeamMember
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.R
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Who the person is among the trainers of the workspace (F020 AC2): the API has no "me" on a trainer.
class SessionTeamTest {
    private val john = Trainer(UUID.nameUUIDFromBytes("john".toByteArray()), "John")
    private val sarah = Trainer(UUID.nameUUIDFromBytes("sarah".toByteArray()), "Sarah")
    private val members = listOf(
        TeamMember(john.id, "John", "owner@example.com", TeamMember.Role.OWNER),
        TeamMember(sarah.id, "Sarah", "trainer@example.com", TeamMember.Role.TRAINER),
    )

    @Test
    fun test_F020_AC2_theOwnerIsFoundByTheAddressTheySignInWith() {
        val mine = SessionTeam.myTrainerId(listOf(john, sarah), members, true, "Owner@Example.com", null)

        assertEquals(john.id, mine)
    }

    @Test
    fun test_F020_AC2_aTrainerWhoCannotReadTheTeamIsFoundByNameWhenNoOtherTrainerHasIt() {
        assertEquals(
            sarah.id,
            SessionTeam.myTrainerId(listOf(john, sarah), null, false, "trainer@example.com", "Sarah"),
        )
        assertNull(
            SessionTeam.myTrainerId(
                listOf(sarah, Trainer(UUID.randomUUID(), "Sarah")),
                null,
                false,
                "trainer@example.com",
                "Sarah",
            ),
        )
    }

    @Test
    fun test_F020_AC2_aTeamReadThatFailedIsNotAnswerWithAnotherNamesake() {
        assertNull(SessionTeam.myTrainerId(listOf(john, sarah), null, true, "owner@example.com", "John"))
    }

    @Test
    fun test_F020_AC2_aPersonWithoutATrainerProfileIsNoTrainer() {
        assertNull(SessionTeam.myTrainerId(listOf(sarah), members, true, "owner@example.com", "John"))
        assertNull(SessionTeam.myTrainerId(listOf(sarah), null, false, "x@example.com", null))
    }

    @Test
    fun test_F020_AC2_theWordFormsAreTheOnesTheCatalogHasForTheWorkspacesWord() {
        val forms = TrainerWordForms.of(TrainerWord.COACH) { "$it" }

        assertEquals(
            TrainerWordForms(
                "${R.string.trainer_word_coach_word}",
                "${R.string.trainer_word_coach_word_cap}",
                "${R.string.trainer_word_coach_a_word}",
            ),
            forms,
        )
    }
}
