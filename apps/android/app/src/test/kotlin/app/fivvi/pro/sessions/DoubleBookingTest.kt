package app.fivvi.pro.sessions

import app.fivvi.api.models.TrainerConflictItem
import app.fivvi.core.R
import java.io.File
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// PS-07 *Dubbele boeking* (F023 AC6): how the app words the sessions the API lists; it finds no overlap itself (AC7).
class DoubleBookingTest {
    private val amsterdam = ZoneId.of("Europe/Amsterdam")

    /** A string of the generated Android catalog (`values/` is nl-NL, `values-en/` English), as the app reads it. */
    private fun words(folder: String, name: String): String {
        val catalog = File("../../../packages/i18n/generated/android/$folder/strings.xml").readText()
        return Regex("""<string name="$name">(.*?)</string>""").find(catalog)!!.groupValues[1]
    }

    /** The lines of the three sessions of a Thursday morning, in the language of [folder], as the dialog shows them. */
    private fun lines(folder: String, english: Boolean): List<String> {
        val format = SessionFormat(if (english) Locale.UK else Locale.forLanguageTag("nl-NL"), amsterdam)
        val booking = DoubleBooking(
            listOf(
                item(TrainerConflictItem.Type.PRIVATE, "Mark Jansen", start = "07:00:00Z", end = "08:00:00Z"),
                item(TrainerConflictItem.Type.GROUP, "Kracht", "Strength", start = "07:30:00Z", end = "08:30:00Z"),
                item(TrainerConflictItem.Type.OPEN_GYM, "Open Gym", start = "07:45:00Z", end = "09:00:00Z"),
            ),
            "Tom",
        )
        val item = words(folder, "sessions_double_booking_item")
        fun type(res: String) = words(folder, "sessions_double_booking_type_$res")
        return booking.conflicts.zip(listOf(type("private"), type("group"), type("open_gym")))
            .map { (conflict, type) -> booking.line(conflict, english, format, item, type) }
    }

    private fun item(
        type: TrainerConflictItem.Type = TrainerConflictItem.Type.PRIVATE,
        name: String = "Anna de Vries",
        nameEn: String? = null,
        start: String = "07:00:00Z",
        end: String = "08:00:00Z",
    ) = TrainerConflictItem(
        UUID.nameUUIDFromBytes(name.toByteArray()),
        type,
        OffsetDateTime.parse("2026-09-24T$start"),
        OffsetDateTime.parse("2026-09-24T$end"),
        name,
        nameEn,
    )

    // The sessions start 09:00, 09:30 and 09:45 at the wall clock of Amsterdam (UTC+2 in September): the line says the zone
    // of the workspace, the start before the end, the type in words, and a class its English name to an English reader.
    @Test
    fun test_F023_AC6_everyOverlappingSessionIsOneLineWithItsTypeInTheWorkspacesTimeZone() {
        assertEquals(
            listOf(
                "do 24 sep, 09:00–10:00: Mark Jansen (privésessie)",
                "do 24 sep, 09:30–10:30: Kracht (groepsles)",
                "do 24 sep, 09:45–11:00: Open Gym (Open Gym)",
            ),
            lines("values", english = false),
        )
        assertEquals(
            listOf(
                "Thu 24 Sept, 09:00–10:00: Mark Jansen (private session)",
                "Thu 24 Sept, 09:30–10:30: Strength (group class)",
                "Thu 24 Sept, 09:45–11:00: Open Gym (Open Gym)",
            ),
            lines("values-en", english = true),
        )
    }

    @Test
    fun test_F023_AC6_theTypeOfEachSessionHasItsOwnWord() {
        val booking = DoubleBooking(emptyList(), null)

        assertEquals(R.string.sessions_double_booking_type_private, booking.typeOf(item()))
        assertEquals(R.string.sessions_double_booking_type_group, booking.typeOf(item(TrainerConflictItem.Type.GROUP)))
        assertEquals(
            R.string.sessions_double_booking_type_open_gym,
            booking.typeOf(item(TrainerConflictItem.Type.OPEN_GYM)),
        )
    }

    @Test
    fun test_F023_AC6_aClassShowsItsEnglishNameToAnEnglishReaderElseTheDutchOne() {
        val booking = DoubleBooking(emptyList(), null)
        val yoga = item(TrainerConflictItem.Type.GROUP, "Yoga voor iedereen", "Yoga for everyone")

        assertEquals("Yoga for everyone", booking.nameOf(yoga, english = true))
        assertEquals("Yoga voor iedereen", booking.nameOf(yoga, english = false))
        val withoutEnglish = item(name = "Yoga voor iedereen", nameEn = "")
        assertEquals("Yoga voor iedereen", booking.nameOf(withoutEnglish, english = true))
        assertEquals("Anna de Vries", booking.nameOf(item(), english = true))
    }

    @Test
    fun test_F023_AC6_noSessionsListedIsNoWarning() {
        assertNull(DoubleBooking.of(emptyList(), "Tom"))
        assertNull(DoubleBooking.of(null, "Tom"))
        assertEquals("Tom", DoubleBooking.of(listOf(item()), "Tom")?.trainerName)
    }
}
