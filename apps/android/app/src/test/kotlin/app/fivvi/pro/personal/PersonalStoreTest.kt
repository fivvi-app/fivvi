package app.fivvi.pro.personal

import java.io.File
import java.time.Instant
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

// What the personal screens keep for the offline view (F013 AC7): the day as it was read, the workspaces the person was on,
// in a file of the app, and nothing of it after a sign-out.
class PersonalStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun cache(directory: File = File(folder.root, PersonalStore.DIRECTORY)) =
        PersonalCache(FilePersonalStore(directory))

    @Test
    fun test_F013_AC7_theDayComesBackAsItWasKept() {
        val saved = Instant.parse("2026-09-22T06:35:00Z")
        cache().day = PersonalCache.Day(PersonalFixtures.sarah(), saved)

        val kept = cache().day

        assertEquals(PersonalFixtures.sarah().items.map { it.sessionId }, kept?.day?.items?.map { it.sessionId })
        assertEquals(PersonalFixtures.at("12:00").toInstant(), kept?.day?.freeGap?.startsAt?.toInstant())
        assertEquals("Anna de Vries", kept?.day?.items?.first()?.clientName)
        assertEquals(saved, kept?.savedAt)
    }

    @Test
    fun test_F013_AC7_theWorkspacesComeBackByIdAndName() {
        val johns = PersonalCache.Workspace(UUID.nameUUIDFromBytes("john".toByteArray()), "John's Gym")
        cache().workspaces = listOf(johns)

        assertEquals(listOf(johns), cache().workspaces)
        assertNull(cache(File(folder.root, "other")).workspaces)
    }

    @Test
    fun test_F013_AC7_aSignOutForgetsEverything() {
        val directory = File(folder.root, PersonalStore.DIRECTORY)
        val store = FilePersonalStore(directory)
        PersonalCache(store).apply {
            day = PersonalCache.Day(PersonalFixtures.sarah(), Instant.now())
            workspaces = listOf(PersonalCache.Workspace(UUID.randomUUID(), "John's Gym"))
        }
        assertTrue(directory.listFiles().orEmpty().isNotEmpty())

        store.clear()

        assertNull(PersonalCache(store).day)
        assertNull(PersonalCache(store).workspaces)
        assertFalse(directory.exists())
    }

    @Test
    fun test_F013_AC7_aFileThatCantBeReadIsNoDay() {
        val directory = File(folder.root, PersonalStore.DIRECTORY)
        directory.mkdirs()
        File(directory, "day.json").writeText("not json")

        assertNull(cache(directory).day)
    }
}
