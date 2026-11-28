package app.fivvi.pro.classes

import app.fivvi.pro.sessions.trainerOf
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// TD-03 *Groepsles* of a substituted date (F024 AC4 and the design of DECISIONS.md §3, Android): the covering trainer gets the
// banner "Je valt in voor Sarah", everyone else reads "Mike (vervangt Sarah)", and the Owner's ⋯ menu has the substitute
// action, which says it is managed on the web. The words are the string catalog's (SubstitutionScreenTest, nl-NL and en).
class ClassDateSubstitutionTest {
    private val mike = trainerOf("Mike")
    private val john = trainerOf("John")
    private val kracht = groupClassOf("Kracht", trainer = trainerOf("Sarah"))

    private fun state(
        trainer: app.fivvi.api.models.Trainer? = mike,
        substituteFor: String? = "Sarah Visser",
        me: UUID = john.id,
        canManage: Boolean = true,
        cancelled: Boolean = false,
    ): ClassDateState {
        val date = classDateOf(UUID.randomUUID(), kracht, trainer, substituteFor = substituteFor)
        return ClassDateState(
            myTeamMemberId = me,
            canManage = canManage,
            load = ClassDateLoad.Loaded,
            session = if (cancelled) date.copy(status = app.fivvi.api.models.Session.Status.CANCELLED) else date,
        )
    }

    @Test
    fun test_F024_AC4_theCoveringTrainerGetsTheBannerWithTheNameOfWhomSheReplaces() {
        val covering = state(me = mike.id, canManage = false)

        assertEquals("Sarah Visser", covering.coveringFor)
        assertNull("what she reads in the trainer row is Jij, not the pair", covering.replacedTrainer)
    }

    @Test
    fun test_F024_AC4_everyoneElseReadsTheSubstituteWithWhomHeReplaces() {
        val owner = state()

        assertNull("the banner is for the one who covers", owner.coveringFor)
        assertEquals("Sarah Visser", owner.replacedTrainer)
    }

    @Test
    fun test_F024_AC4_aDateWithoutASubstitutionHasNeitherBannerNorPair() {
        val plain = state(substituteFor = null)

        assertNull(plain.coveringFor)
        assertNull(plain.replacedTrainer)
        assertNull(state(substituteFor = "", me = mike.id).coveringFor)
        assertNull(state(substituteFor = "").replacedTrainer)
    }

    @Test
    fun test_F024_Design_theOwnersMenuHasTheSubstituteActionOnADateThatHasATrainer() {
        assertTrue(state().showsSubstitute)
        assertFalse("no trainer to replace", state(trainer = null, substituteFor = null).showsSubstitute)
        assertFalse(
            "a Trainer has no menu, a covering one neither",
            state(me = mike.id, canManage = false).showsSubstitute,
        )
        assertFalse("not on a cancelled date", state(cancelled = true).showsSubstitute)
    }
}
