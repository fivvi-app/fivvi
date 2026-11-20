package app.fivvi.pro.sessions

import app.fivvi.api.models.TrainerConflictItem
import app.fivvi.core.R
import java.time.OffsetDateTime
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// PS-07 *Dubbele boeking* (F023 AC6): how the app words the sessions the API lists; it finds no overlap itself (AC7).
class DoubleBookingTest {
    private fun item(
        type: TrainerConflictItem.Type = TrainerConflictItem.Type.PRIVATE,
        name: String = "Anna de Vries",
        nameEn: String? = null,
    ) = TrainerConflictItem(
        UUID.nameUUIDFromBytes(name.toByteArray()),
        type,
        OffsetDateTime.parse("2026-09-24T07:00:00Z"),
        OffsetDateTime.parse("2026-09-24T08:00:00Z"),
        name,
        nameEn,
    )

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
