package app.fivvi.pro.personal

import app.fivvi.api.models.MySessions
import java.io.File
import java.time.Instant
import java.time.LocalDate
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

    private fun answer(from: String, until: String, saved: String = "2026-09-22T06:35:00Z") = PersonalCache.Sessions(
        LocalDate.parse(from),
        LocalDate.parse(until),
        MySessions(
            from,
            until,
            "Europe/Amsterdam",
            2,
            PersonalFixtures.offered(2, true),
            true,
            PersonalFixtures.sarah().items,
        ),
        Instant.parse(saved),
    )

    @Test
    fun test_F013_AC7_theRangeComesBackAsItWasKept() {
        cache().keep(answer("2026-09-21", "2026-09-27"))

        val kept = cache().sessions.single()

        assertEquals(LocalDate.parse("2026-09-21"), kept.from)
        assertEquals(LocalDate.parse("2026-09-27"), kept.until)
        assertEquals(Instant.parse("2026-09-22T06:35:00Z"), kept.savedAt)
        assertEquals(PersonalFixtures.sarah().items.map { it.sessionId }, kept.response.items.map { it.sessionId })
        assertEquals("Anna de Vries", kept.response.items.first().clientName)
    }

    @Test
    fun test_F013_AC7_theLastSixRangesAreKeptNewestFirstAndOneRangeOnce() {
        val cache = cache()
        (1..8).forEach { week ->
            val monday = LocalDate.parse("2026-09-21").plusWeeks(week.toLong())
            cache.keep(answer(monday.toString(), monday.plusDays(6).toString()))
        }
        assertEquals("six, no more", PersonalCache.KEPT_RANGES, cache.sessions.size)
        assertEquals(6, PersonalCache.KEPT_RANGES)
        assertEquals("newest first", LocalDate.parse("2026-11-16"), cache.sessions.first().from)
        assertEquals("the oldest two are gone", LocalDate.parse("2026-10-12"), cache.sessions.last().from)

        cache.keep(answer("2026-10-12", "2026-10-18", saved = "2026-09-23T06:35:00Z"))

        assertEquals("the same days replace their earlier answer", 6, cache.sessions.size)
        assertEquals(LocalDate.parse("2026-10-12"), cache.sessions.first().from)
        assertEquals(Instant.parse("2026-09-23T06:35:00Z"), cache.sessions.first().savedAt)
        assertEquals(1, cache.sessions.count { it.from == LocalDate.parse("2026-10-12") })
    }

    @Test
    fun test_F013_AC7_aSignOutForgetsTheRangesToo() {
        val store = FilePersonalStore(File(folder.root, PersonalStore.DIRECTORY))
        PersonalCache(store).keep(answer("2026-09-21", "2026-09-27"))

        store.clear()

        assertTrue(PersonalCache(store).sessions.isEmpty())
    }

    @Test
    fun test_F013_AC7_aFileOfRangesThatCantBeReadIsNoRanges() {
        val directory = File(folder.root, PersonalStore.DIRECTORY)
        directory.mkdirs()
        File(directory, "sessions.json").writeText("[{\"from\": 1}]")

        assertTrue(cache(directory).sessions.isEmpty())
    }
}
