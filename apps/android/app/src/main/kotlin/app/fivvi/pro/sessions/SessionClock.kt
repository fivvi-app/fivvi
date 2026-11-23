package app.fivvi.pro.sessions

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * The date and the time of day the session forms send (`localDate` `YYYY-MM-DD`, `localStart` `HH:mm`), the end time the
 * forms show, and the reading of an instant in the workspace's time zone. The API decides every rule about them (a time
 * the clocks skip, a past start, ADR-012); nothing here refuses a time, it only writes down what was chosen.
 */
object SessionClock {
    private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ROOT)
    private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT)

    /** Where a session that starts at some moment ends: the time, and whether it is on another day than the start. */
    data class End(val time: String, val nextDay: Boolean)

    /** `2026-11-16`: the day of [start]. */
    fun localDate(start: LocalDateTime): String = DATE.format(start)

    /** `09:30`, 24 hours: the time of day of [start]. */
    fun localStart(start: LocalDateTime): String = TIME.format(start)

    /** The end of a session that starts at [start] (wall clock in [zone]) and lasts [minutes]. */
    fun end(start: LocalDateTime, minutes: Int, zone: ZoneId): End {
        val end = start.atZone(zone).plusMinutes(minutes.toLong()).toLocalDateTime()
        return End(TIME.format(end), end.toLocalDate() != start.toLocalDate())
    }

    /** The form's first start: the next whole hour after [now] on the wall clock of [zone]. */
    fun nextFullHour(now: Instant, zone: ZoneId): LocalDateTime =
        now.atZone(zone).toLocalDateTime().truncatedTo(ChronoUnit.HOURS).plusHours(1)

    /** The minutes between two instants, as the API's `durationMinutes` of a stored session. */
    fun minutes(start: OffsetDateTime, end: OffsetDateTime): Int = ChronoUnit.MINUTES.between(start, end).toInt()

    /** The wall clock of [instant] in [zone]. */
    fun local(instant: OffsetDateTime, zone: ZoneId): LocalDateTime = instant.atZoneSameInstant(zone).toLocalDateTime()
}

/**
 * How the session screens write a date and a time: in the interface language's formatting locale (English as en-GB, as
 * the web and `packages/i18n` do) and the workspace's time zone (ADR-012).
 */
class SessionFormat(val locale: Locale, private val zone: ZoneId) {
    private fun formatted(instant: OffsetDateTime, pattern: String): String =
        DateTimeFormatter.ofPattern(pattern, locale).format(instant.atZoneSameInstant(zone))

    /** *do 24 sep*, as the web words it. */
    fun day(instant: OffsetDateTime): String = formatted(instant, DAY)

    /** The same for a date of the workspace's own wall clock. */
    fun day(date: LocalDate): String = DateTimeFormatter.ofPattern(DAY, locale).format(date)

    /** *do 24 sep 2026*, for a date of the workspace's own wall clock. */
    fun dayYear(date: LocalDate): String = DateTimeFormatter.ofPattern(DAY_YEAR, locale).format(date)

    /** *donderdag*, the weekday of a date of the workspace's own wall clock. */
    fun weekday(date: LocalDate): String = weekday(date.dayOfWeek)

    /** *donderdag*, the weekday a series names. */
    fun weekday(day: DayOfWeek): String = day.getDisplayName(TextStyle.FULL, locale)

    /** *donderdag 24 september 2026* */
    fun longDay(instant: OffsetDateTime): String = formatted(instant, LONG_DAY)

    /** *do 24 sep 2026* */
    fun dayYear(instant: OffsetDateTime): String = formatted(instant, DAY_YEAR)

    /** *24 sep*, for a date of the workspace's own wall clock. */
    fun dayMonth(date: LocalDate): String = DateTimeFormatter.ofPattern(DAY_MONTH, locale).format(date)

    /** *24 sep 2026*, for a date of the workspace's own wall clock. */
    fun dayMonthYear(date: LocalDate): String = DateTimeFormatter.ofPattern(DAY_MONTH_YEAR, locale).format(date)

    /** *donderdag 24 september*, for a date of the workspace's own wall clock. */
    fun weekdayDay(date: LocalDate): String = DateTimeFormatter.ofPattern(WEEKDAY_DAY, locale).format(date)

    /** *September 2026*, for a date of the workspace's own wall clock. */
    fun monthYear(date: LocalDate): String =
        DateTimeFormatter.ofPattern(MONTH_YEAR, locale).format(date).replaceFirstChar { it.titlecase(locale) }

    /** *D*, the letter of the weekday: *M D W D V Z Z* from Monday. */
    fun weekdayLetter(day: DayOfWeek): String = day.getDisplayName(TextStyle.NARROW_STANDALONE, locale)

    /** *09:30*, 24 hours. */
    fun time(instant: OffsetDateTime): String = formatted(instant, "HH:mm")

    private companion object {
        const val DAY = "EEE d MMM"
        const val LONG_DAY = "EEEE d MMMM y"
        const val DAY_YEAR = "EEE d MMM y"
        const val DAY_MONTH = "d MMM"
        const val DAY_MONTH_YEAR = "d MMM y"
        const val WEEKDAY_DAY = "EEEE d MMMM"
        const val MONTH_YEAR = "LLLL y"
    }
}
