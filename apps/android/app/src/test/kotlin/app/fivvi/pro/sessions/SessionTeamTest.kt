package app.fivvi.pro.sessions

import app.fivvi.api.models.Trainer
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Who the person is among the trainers of the workspace (F020 AC2): by the team-member ID of `GET /api/v1/me`, never by
// address or name.
class SessionTeamTest {
    private val john = Trainer(UUID.nameUUIDFromBytes("john".toByteArray()), "John")
    private val sarah = Trainer(UUID.nameUUIDFromBytes("sarah".toByteArray()), "Sarah")
    private val otherSarah = Trainer(UUID.nameUUIDFromBytes("other sarah".toByteArray()), "Sarah")

    @Test
    fun test_F020_AC2_thePersonIsTheTrainerWithTheirOwnTeamMemberId() {
        assertEquals(john.id, SessionTeam.myTrainerId(listOf(john, sarah), john.id))
    }

    @Test
    fun test_F020_1414_AC2_twoTrainersWithTheSameNameAreToldApartByTheId() {
        assertEquals(otherSarah.id, SessionTeam.myTrainerId(listOf(sarah, otherSarah), otherSarah.id))
        assertEquals(sarah.id, SessionTeam.myTrainerId(listOf(sarah, otherSarah), sarah.id))
    }

    @Test
    fun test_F020_AC2_aPersonWithoutATrainerProfileIsNoTrainer() {
        assertNull(SessionTeam.myTrainerId(listOf(sarah), john.id))
    }
}
