package app.fivvi.pro.home

import app.fivvi.api.models.MeWorkspace
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// What the + of the home offers (F020, F021 AC7), from the capabilities the API lists and nothing else.
class NewMenuOptionsTest {
    private fun options(vararg listed: MeWorkspace.Capabilities) = NewMenuOptions.of { it in listed }

    @Test
    fun test_F021_AC6_theOwnerWithClassManageGetsGroupClass() {
        val owner = options(
            MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY,
            MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE,
        )

        assertTrue(owner.showsPrivateSession)
        assertTrue(owner.showsGroupClass)
        assertFalse(owner.showsGroupClassNote)
        assertTrue(owner.isVisible)
    }

    @Test
    fun test_F021_AC7_aTrainerWhoPlansSessionsButNotClassesGetsNoGroupClassAndTheNote() {
        val trainer = options(MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN)

        assertTrue(trainer.showsPrivateSession)
        assertFalse(trainer.showsGroupClass)
        assertTrue(trainer.showsGroupClassNote)
        assertTrue(trainer.isVisible)
    }

    @Test
    fun test_F021_AC7_someoneWhoPlansNothingHasNoMenuAndNoNote() {
        val none = options(MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)

        assertFalse(none.isVisible)
        assertFalse(none.showsGroupClassNote)
    }

    @Test
    fun test_F021_AC6_classManageAloneGivesGroupClassWithoutAPrivateSession() {
        val classes = options(MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE)

        assertFalse(classes.showsPrivateSession)
        assertTrue(classes.showsGroupClass)
        assertFalse(classes.showsGroupClassNote)
    }
}
