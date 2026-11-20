package app.fivvi.pro.sessions

import app.fivvi.api.models.ValidationErrorIssuesInner
import java.time.LocalDateTime
import java.time.LocalTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// What the forms hold about the time (F020, F021): a start, a length and what the API refused about them.
class SessionTimeTest {
    private val time = SessionTime(LocalDateTime.of(2026, 9, 24, 18, 0))

    @Test
    fun test_F021_AC6_theEndIsTheTimeBetweenItAndTheStart() {
        assertEquals(75, time.withEnd(LocalTime.of(19, 15)).durationMinutes)
        assertEquals(0, time.withEnd(LocalTime.of(18, 0)).durationMinutes)
        assertEquals(-30, time.withEnd(LocalTime.of(17, 30)).durationMinutes)
    }

    @Test
    fun test_F021_AC6_aClassFormsNestedDateAndStartAreRefusedLikeTheSessionFormsOwn() {
        val nestedDate = time.refusedBy(listOf(ValidationErrorIssuesInner("firstDate.localDate", "invalid_date")))
        val nestedStart = time.refusedBy(
            listOf(ValidationErrorIssuesInner("firstDate.localStart", "time_does_not_exist")),
        )
        val plain = time.refusedBy(listOf(ValidationErrorIssuesInner("localStart", "invalid_time")))

        assertEquals(TimeRefusal.InvalidDate, nestedDate?.refusal)
        assertEquals(TimeRefusal.TimeDoesNotExist, nestedStart?.refusal)
        assertEquals(TimeRefusal.InvalidTime, plain?.refusal)
    }

    @Test
    fun test_F021_AC6_aRefusalOfAnotherFieldIsNotATimeRefusal() {
        assertNull(time.refusedBy(listOf(ValidationErrorIssuesInner("nameNl", "too_small"))))
        assertNull(time.refusedBy(emptyList()))
    }
}
