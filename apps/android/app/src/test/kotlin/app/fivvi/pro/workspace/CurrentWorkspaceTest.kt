package app.fivvi.pro.workspace

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private val ID = UUID.fromString("00000000-0000-4000-8000-000000000002")

class CurrentWorkspaceTest {
    @Test
    fun test_F012_AC7_nothingIsRememberedOnAFreshDevice() {
        assertNull(CurrentWorkspace(InMemoryLastWorkspaceStore()).remembered.value)
    }

    @Test
    fun test_F012_AC7_rememberingKeepsTheIdOnTheDeviceAndPublishesIt() {
        val store = InMemoryLastWorkspaceStore()
        val current = CurrentWorkspace(store)

        current.remember(ID)

        assertEquals(ID, store.id)
        assertEquals(ID, current.remembered.value)
    }

    @Test
    fun test_F012_AC7_aNewStoreReadsWhatWasKept() {
        assertEquals(ID, CurrentWorkspace(InMemoryLastWorkspaceStore(ID)).remembered.value)
    }
}
