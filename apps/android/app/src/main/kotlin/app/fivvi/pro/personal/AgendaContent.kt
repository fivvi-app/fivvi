package app.fivvi.pro.personal

import app.fivvi.api.models.PersonalSession
import app.fivvi.core.kit.SessionType
import app.fivvi.pro.personal.AgendaCalendar.ClockChange
import app.fivvi.pro.sessions.SessionFormat
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate

/** A dot under a day: the colour of the session's type. */
enum class AgendaKind(val sessionType: SessionType, val tagName: String) {
    Private(SessionType.Private, "private"),
    Group(SessionType.Group, "group"),
}

/** A day of the strip or of the month grid. */
data class AgendaDayCell(
    val day: LocalDate,
    /** 22 */
    val number: Int,
    /** The weekday's letter, *D*. */
    val weekday: String,
    val isToday: Boolean,
    val isSelected: Boolean,
    /** A day of the grid in another month: dimmed. */
    val isOutsideMonth: Boolean,
    /** One per session that takes place, at most three. */
    val dots: List<AgendaKind>,
    /** How many sessions take place (cancelled ones not counted). */
    val count: Int,
)

/** A day of the week list: its rows, or nothing, which the screen says. */
data class AgendaWeekSection(val day: LocalDate, val isToday: Boolean, val rows: List<PersonalRow>)

/** The day the clocks change, [dayText] written *zo 25 okt*: the screen words it as *wintertijd* or *zomertijd*. */
data class AgendaClockNote(val day: LocalDate, val change: ClockChange, val dayText: String)

/**
 * What TD-04 shows of the answer for the days on screen, written down for [state]'s view at [now]: which days, dots and notes
 * a view has, and the rows of a day, TD-01's rows, in time order. The server decides which sessions there are; nothing here
 * decides a rule. Open Gym comes later (`PRODUCT.md §53`): no screen shows it.
 */
class AgendaContent(private val state: AgendaState, private val now: Instant, private val format: SessionFormat) {
    private val calendar = AgendaCalendar(PersonalRows.TIME_ZONE)
    private val response = state.read?.response
    private val items: List<PersonalSession> = response?.items.orEmpty().filter {
        it.type !=
            PersonalSession.Type.OPEN_GYM
    }
    private val builder = PersonalRows(response?.showsKindLabel ?: false, response?.workspaceCount ?: 1, now, format)
    private val today = calendar.day(now)

    private fun items(on: LocalDate) = items.filter { calendar.day(it.startsAt) == on }

    /** The rows of a day, TD-01's rows, in time order. */
    fun rows(day: LocalDate): List<PersonalRow> = items(day).map(builder::row)

    val selectedRows: List<PersonalRow> get() = rows(state.selectedDay)

    /** *Geen sessies op deze dag.*, once the days are read and the selected one has none. */
    val showsEmptyDay: Boolean get() = state.load == AgendaLoad.Loaded && selectedRows.isEmpty()

    /** The weekday letters, Monday first: *M D W D V Z Z*. */
    val weekdayLetters: List<String> = DayOfWeek.entries.map(format::weekdayLetter)

    private fun cell(day: LocalDate, letter: String): AgendaDayCell {
        // A date a substitute took over is not one she teaches (F024): no dot, no count.
        val sessions = items(day).filter { it.status != PersonalSession.Status.CANCELLED && it.takenOverBy == null }
        return AgendaDayCell(
            day = day,
            number = day.dayOfMonth,
            weekday = letter,
            isToday = day == today,
            isSelected = day == state.selectedDay,
            isOutsideMonth = state.mode == AgendaMode.Month && !calendar.isInMonth(day, state.selectedDay),
            dots = sessions.take(MAX_DOTS).map {
                if (it.type ==
                    PersonalSession.Type.GROUP
                ) {
                    AgendaKind.Group
                } else {
                    AgendaKind.Private
                }
            },
            count = sessions.size,
        )
    }

    /** The seven days of the selected day's week, Monday first. */
    val weekDays: List<LocalDate> = calendar.week(state.selectedDay)

    /** The ISO number of that week. */
    val weekNumber: Int = calendar.weekNumber(state.selectedDay)

    /** The week of the selected day: the strip of *Dag* and *Week*. */
    val strip: List<AgendaDayCell> get() = weekDays.mapIndexed { index, day -> cell(day, weekdayLetters[index]) }

    /** The month grid, Monday first. */
    val grid: List<AgendaDayCell>
        get() = calendar.monthGrid(state.selectedDay).mapIndexed { index, day ->
            cell(day, weekdayLetters[index % DAYS_PER_WEEK])
        }

    /** *Oktober 2026* */
    val monthTitle: String get() = format.monthYear(state.selectedDay)

    /** The days of the view the clocks change on, with how: *zo 25 okt*. */
    val clockNotes: List<AgendaClockNote>
        get() = calendar.clockChanges(state.visibleDays).map { (day, change) ->
            AgendaClockNote(day, change, format.day(day))
        }

    /** The week list of *Week*: a day each, under its date. */
    val weekSections: List<AgendaWeekSection>
        get() = weekDays.map { AgendaWeekSection(it, it == today, rows(it)) }

    /** *Dag*: the selected day as a timeline, at the time of this content for the now-line, or `null` for a day with none. */
    fun timeline(): AgendaTimeline? {
        val entries = items(state.selectedDay).map { AgendaTimeline.Entry(builder.row(it), it.startsAt, it.endsAt) }
        return AgendaTimeline.make(entries, state.selectedDay, now, calendar)
    }

    private companion object {
        const val MAX_DOTS = 3
        const val DAYS_PER_WEEK = 7
    }
}
