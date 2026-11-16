package app.fivvi.pro.sessions

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The date and the time the session forms send, the end they show and how the screens write a moment (F020 AC1, AC10,
// ADR-012). Nothing here refuses a time: the API decides every rule about it.
class SessionClockTest {
    private val amsterdam = ZoneId.of("Europe/Amsterdam")

    @Test
    fun test_F020_AC1_theFormSendsTheLocalDateAndStartOfTheWorkspace() {
        val start = LocalDateTime.of(2026, 9, 24, 9, 5)

        assertEquals("2026-09-24", SessionClock.localDate(start))
        assertEquals("09:05", SessionClock.localStart(start))
    }

    @Test
    fun test_F020_AC1_theEndIsStartPlusDuration() {
        val end = SessionClock.end(LocalDateTime.of(2026, 9, 24, 9, 0), 60, amsterdam)

        assertEquals(SessionClock.End("10:00", nextDay = false), end)
    }

    @Test
    fun test_F020_AC4_pastMidnightTheEndIsOnTheNextDay() {
        val end = SessionClock.end(LocalDateTime.of(2026, 9, 24, 23, 30), 90, amsterdam)

        assertEquals(SessionClock.End("01:00", nextDay = true), end)
    }

    @Test
    fun test_F020_AC10_theFirstStartIsTheNextFullHourInTheWorkspaceZone() {
        // 22:20 UTC is 00:20 the next day in Amsterdam in summer.
        val now = Instant.parse("2026-09-23T22:20:00Z")

        assertEquals(LocalDateTime.of(2026, 9, 24, 1, 0), SessionClock.nextFullHour(now, amsterdam))
        // On the hour itself it is the hour after.
        assertEquals(
            LocalDateTime.of(2026, 9, 24, 2, 0),
            SessionClock.nextFullHour(Instant.parse("2026-09-23T23:00:00Z"), amsterdam),
        )
    }

    @Test
    fun test_F020_AC6_theLengthOfAStoredSessionIsTheMinutesBetweenItsInstants() {
        val start = OffsetDateTime.parse("2026-09-24T07:00:00.000Z")

        assertEquals(60, SessionClock.minutes(start, OffsetDateTime.parse("2026-09-24T08:00:00.000Z")))
        assertEquals(45, SessionClock.minutes(start, OffsetDateTime.parse("2026-09-24T07:45:00.000Z")))
    }

    @Test
    fun test_F020_AC6_aStoredInstantIsShownInTheWorkspaceZone() {
        val start = OffsetDateTime.parse("2026-09-24T07:00:00.000Z")

        assertEquals(LocalDateTime.of(2026, 9, 24, 9, 0), SessionClock.local(start, amsterdam))
    }

    @Test
    fun test_F020_AC10_theScreensWriteTheDayAndTheTimeInTheLocaleAndTheZoneOfTheWorkspace() {
        val instant = OffsetDateTime.parse("2026-09-24T07:00:00.000Z")
        val dutch = SessionFormat(Locale.forLanguageTag("nl-NL"), amsterdam)
        val english = SessionFormat(Locale.UK, amsterdam)

        assertEquals("do 24 sep", dutch.day(instant))
        assertEquals("donderdag 24 september 2026", dutch.longDay(instant))
        assertEquals("do 24 sep 2026", dutch.dayYear(instant))
        assertEquals("09:00", dutch.time(instant))
        assertEquals("09:00", english.time(instant))
        assertTrue(english.day(instant), english.day(instant).startsWith("Thu 24 Sep"))
        assertEquals("Thursday 24 September 2026", english.longDay(instant))
        assertEquals("do 24 sep", dutch.day(LocalDate.of(2026, 9, 24)))
    }
}
