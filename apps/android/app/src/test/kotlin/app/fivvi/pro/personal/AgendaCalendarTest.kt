package app.fivvi.pro.personal

import app.fivvi.pro.personal.AgendaCalendar.ClockChange
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The days of Agenda (TD-04, F013 AC6): weeks and month grids Monday first, the ISO week number and the days the clocks
// change, all by the wall clock of Dutch time (ADR-012).
class AgendaCalendarTest {
    private val calendar = AgendaCalendar(PersonalRows.TIME_ZONE)

    private fun day(text: String) = LocalDate.parse(text)

    private fun days(vararg text: String) = text.map(LocalDate::parse)

    @Test
    fun test_F013_AC6_aWeekIsMondayFirst() {
        assertEquals(
            days("2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"),
            calendar.week(day("2026-10-22")),
        )
        assertEquals("a Sunday ends its week", day("2026-10-19"), calendar.week(day("2026-10-25")).first())
        assertEquals("a Monday starts it", day("2026-10-26"), calendar.week(day("2026-10-26")).first())
    }

    @Test
    fun test_F013_AC6_theWeekNumberIsTheISOWeek() {
        assertEquals(43, calendar.weekNumber(day("2026-10-22")))
        assertEquals(39, calendar.weekNumber(day("2026-09-22")))
        assertEquals("1 January 2027 is in the last week of 2026", 53, calendar.weekNumber(day("2027-01-01")))
        assertEquals(53, calendar.weekNumber(day("2026-12-28")))
    }

    @Test
    fun test_F013_AC6_theMonthGridIsMondayFirstAndCoversWholeWeeks() {
        val october = calendar.monthGrid(day("2026-10-14"))
        assertEquals("1 October 2026 is a Thursday, so Monday 28 September", day("2026-09-28"), october.first())
        assertEquals("and it ends on the Sunday", day("2026-11-01"), october.last())
        assertEquals(35, october.size)
        assertEquals(31, october.count { calendar.isInMonth(it, day("2026-10-14")) })

        val march = calendar.monthGrid(day("2026-03-10"))
        assertEquals(day("2026-02-23"), march.first())
        assertEquals(day("2026-04-05"), march.last())
        assertEquals("six rows at most: the 42 days of a request", 42, march.size)
    }

    @Test
    fun test_F013_AC6_aMonthWithFourRowsHasFour() {
        val february = calendar.monthGrid(day("2027-02-10"))
        assertEquals(day("2027-02-01"), february.first())
        assertEquals(day("2027-02-28"), february.last())
        assertEquals(28, february.size)
    }

    @Test
    fun test_F013_AC15_noMonthIsMoreThan42DaysAndEveryRangeIsWholeWeeks() {
        var month = day("2026-01-15")
        repeat(48) {
            val grid = calendar.monthGrid(month)
            assertEquals("$month: whole weeks", 0, grid.size % 7)
            assertEquals("$month: at most what one request may ask for", true, grid.size <= 42)
            assertEquals("$month: Monday first", java.time.DayOfWeek.MONDAY, grid.first().dayOfWeek)
            month = month.plusMonths(1)
        }
    }

    @Test
    fun test_F013_AC6_daysAreAddedByTheWallClockAcrossTheChangeOfTheClocks() {
        assertEquals(day("2026-10-25"), calendar.addingDays(days = 1, to = day("2026-10-24")))
        assertEquals(
            "the 25-hour day is one day",
            day("2026-10-26"),
            calendar.addingDays(days = 1, to = day("2026-10-25")),
        )
        assertEquals(
            "the 23-hour day is one day",
            day("2026-03-30"),
            calendar.addingDays(days = 1, to = day("2026-03-29")),
        )
        assertEquals(day("2026-10-19"), calendar.addingDays(days = -7, to = day("2026-10-26")))
        assertEquals(day("2027-01-01"), calendar.addingDays(days = 1, to = day("2026-12-31")))
    }

    @Test
    fun test_F013_AC6_aMonthIsMovedByKeepingTheDayOfTheMonthWhenThereIsOne() {
        assertEquals(day("2026-10-22"), calendar.addingMonths(months = 1, to = day("2026-09-22")))
        assertEquals(day("2026-09-22"), calendar.addingMonths(months = -1, to = day("2026-10-22")))
        assertEquals(
            "February has no 31st",
            day("2026-02-28"),
            calendar.addingMonths(months = 1, to = day("2026-01-31")),
        )
        assertEquals(day("2027-01-15"), calendar.addingMonths(months = 1, to = day("2026-12-15")))
    }

    @Test
    fun test_F013_AC6_theDaysTheClocksChangeAreFound() {
        assertEquals("autumn 2026: 03:00 becomes 02:00", ClockChange.Back, calendar.clockChange(day("2026-10-25")))
        assertEquals("spring 2026: 02:00 becomes 03:00", ClockChange.Forward, calendar.clockChange(day("2026-03-29")))
        assertNull(calendar.clockChange(day("2026-10-24")))
        assertNull(calendar.clockChange(day("2026-10-26")))
        assertNull(calendar.clockChange(day("2026-09-22")))
    }

    @Test
    fun test_F013_AC6_aWeekOfFewerOrMoreHoursIsFound() {
        assertEquals(
            listOf(day("2026-10-25") to ClockChange.Back),
            calendar.clockChanges(calendar.week(day("2026-10-22"))),
        )
        assertEquals(0, calendar.clockChanges(calendar.week(day("2026-09-22"))).size)
        assertEquals(
            listOf(day("2026-10-25")),
            calendar.clockChanges(calendar.monthGrid(day("2026-10-14"))).map { it.first },
        )
    }

    @Test
    fun test_F013_AC6_theLocalDayAndMinuteOfAnInstantAreDutchTime() {
        val lateInTheEvening = PersonalFixtures.at("23:30", "2026-10-24")
        assertEquals("23:30 in Amsterdam, which is 21:30 UTC", day("2026-10-24"), calendar.day(lateInTheEvening))
        assertEquals(23 * 60 + 30, calendar.minuteOfDay(lateInTheEvening))
        val justAfterMidnight = PersonalFixtures.at("00:15", "2026-10-25")
        assertEquals(day("2026-10-25"), calendar.day(justAfterMidnight))
        assertEquals(15, calendar.minuteOfDay(justAfterMidnight))
        // The same instant, written in UTC, is the same day in Amsterdam.
        assertEquals(
            day("2026-10-24"),
            calendar.day(lateInTheEvening.toInstant().atOffset(java.time.ZoneOffset.UTC)),
        )
    }
}
