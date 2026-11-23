package app.fivvi.pro.personal

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.IsoFields
import java.time.temporal.TemporalAdjusters

/**
 * The days of Agenda (TD-04, F013): weeks and month grids Monday first, the ISO week number, and the days the clocks change.
 * A day is a date of [zone]'s wall clock (ADR-012), and a day is a day when it has 23 or 25 hours. Nothing here knows a
 * session: it is the calendar the views are drawn on.
 */
class AgendaCalendar(private val zone: ZoneId) {
    /** A day the clocks change: *wintertijd* in autumn, *zomertijd* in spring. */
    enum class ClockChange { Back, Forward }

    /** The day an instant is on, in [zone]. */
    fun day(instant: OffsetDateTime): LocalDate = instant.atZoneSameInstant(zone).toLocalDate()

    fun day(instant: Instant): LocalDate = instant.atZone(zone).toLocalDate()

    fun minuteOfDay(instant: Instant): Int = instant.atZone(zone).toLocalTime().let {
        it.hour * MINUTES_PER_HOUR +
            it.minute
    }

    /** The wall-clock time of an instant as minutes since midnight: 09:30 is 570. */
    fun minuteOfDay(instant: OffsetDateTime): Int =
        instant.atZoneSameInstant(zone).toLocalTime().let { it.hour * MINUTES_PER_HOUR + it.minute }

    /** The day [days] after [to] (before, when negative), by the wall clock. */
    fun addingDays(days: Int, to: LocalDate): LocalDate = to.plusDays(days.toLong())

    /** The same day of another month, or the last day of it when that month is shorter. */
    fun addingMonths(months: Int, to: LocalDate): LocalDate = to.plusMonths(months.toLong())

    /** The seven days of the week [of] is in, Monday first. */
    fun week(of: LocalDate): List<LocalDate> {
        val monday = of.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        return (0 until DAYS_PER_WEEK).map { monday.plusDays(it.toLong()) }
    }

    /** The ISO number of the week [of] is in (week 1 has the year's first Thursday). */
    fun weekNumber(of: LocalDate): Int = of.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)

    /**
     * The days of a month grid: the whole weeks from the one with the 1st to the one with the last day, so five rows mostly
     * and six at most (42 days, what one request may ask for).
     */
    fun monthGrid(of: LocalDate): List<LocalDate> {
        val first = week(of.withDayOfMonth(1)).first()
        val last = week(of.with(TemporalAdjusters.lastDayOfMonth())).last()
        return generateSequence(first) { it.plusDays(1) }.takeWhile { !it.isAfter(last) }.toList()
    }

    /** Whether [day] is in the month [other] is in: the days of the grid outside it are dimmed. */
    fun isInMonth(day: LocalDate, other: LocalDate): Boolean = day.year == other.year && day.month == other.month

    /** Whether the clocks change on [day]: the offset to UTC at its start differs from the one at the next day's start. */
    fun clockChange(on: LocalDate): ClockChange? {
        val before = zone.rules.getOffset(on.atStartOfDay(zone).toInstant())
        val after = zone.rules.getOffset(on.plusDays(1).atStartOfDay(zone).toInstant())
        return when {
            after.totalSeconds > before.totalSeconds -> ClockChange.Forward
            after.totalSeconds < before.totalSeconds -> ClockChange.Back
            else -> null
        }
    }

    /** The days among [days] the clocks change on, with how. */
    fun clockChanges(days: List<LocalDate>): List<Pair<LocalDate, ClockChange>> =
        days.mapNotNull { day -> clockChange(day)?.let { day to it } }

    private companion object {
        const val DAYS_PER_WEEK = 7
        const val MINUTES_PER_HOUR = 60
    }
}
