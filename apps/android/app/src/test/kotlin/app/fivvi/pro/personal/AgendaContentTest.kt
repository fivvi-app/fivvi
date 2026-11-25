package app.fivvi.pro.personal

import app.fivvi.api.models.MySessions
import app.fivvi.api.models.PersonalSession
import app.fivvi.pro.personal.AgendaCalendar.ClockChange
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.sessions.SessionFormat
import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// TD-04 *Agenda* (F013 AC5, AC6 and the design of DECISIONS.md §3, Android): what the answer of `GET /v1/me/sessions` becomes
// on the strip, the month grid, the week lists, the timeline and the notes of the day the clocks change. The words around them
// are the string catalog's and are checked, in nl-NL and en, by the Compose UI tests (AgendaScreenTest).
class AgendaContentTest {
    private fun day(text: String) = LocalDate.parse(text)

    private fun content(
        items: List<PersonalSession> = PersonalFixtures.septemberWeek,
        selected: String = "2026-09-22",
        mode: AgendaMode = AgendaMode.Week,
        now: Instant = PersonalFixtures.now,
        format: SessionFormat = TestFormat.dutch,
        workspaceCount: Int = 2,
        showsKindLabel: Boolean = true,
    ): AgendaContent {
        val base = AgendaState(mode = mode, selectedDay = day(selected), now = now)
        val response = MySessions(
            base.range.from.toString(),
            base.range.until.toString(),
            "Europe/Amsterdam",
            workspaceCount,
            PersonalFixtures.sessionTypes(workspaceCount, showsKindLabel),
            showsKindLabel,
            items.filter { AgendaCalendar(PersonalRows.TIME_ZONE).day(it.startsAt) in base.visibleDays },
        )
        val state = base.copy(
            loaded = mapOf(base.range to AgendaRead(response, now)),
            results = mapOf(base.range to AgendaResult.Success),
        )
        return AgendaContent(state, now, format)
    }

    @Test
    fun test_F013_design_theStripShowsOneDotPerSessionInItsTypesColourAtMostThree() {
        val strip = content().strip

        val tuesday = strip.first { it.day == day("2026-09-22") }
        assertEquals(
            "the cancelled class is not counted",
            listOf(AgendaKind.Private, AgendaKind.Private, AgendaKind.Group),
            tuesday.dots,
        )
        assertEquals(3, tuesday.count)
        assertEquals(
            listOf(AgendaKind.Private, AgendaKind.Private, AgendaKind.Group),
            strip.first { it.day == day("2026-09-23") }.dots,
        )
        assertEquals(emptyList<AgendaKind>(), strip.first { it.day == day("2026-09-21") }.dots)

        val busy = (0 until 5).map {
            PersonalFixtures.session(
                "busy$it",
                PersonalFixtures.johns,
                "%02d:00".format(it + 6),
                "%02d:30".format(it + 6),
                client = "Mark Jansen",
                day = "2026-09-25",
            )
        }
        val friday = content(busy).strip.first { it.day == day("2026-09-25") }
        assertEquals("at most three dots", 3, friday.dots.size)
        assertEquals("the spoken count is the real one", 5, friday.count)
    }

    @Test
    fun test_F013_design_aDotIsInTheColourOfItsSessionType() {
        assertEquals(app.fivvi.core.kit.SessionType.Private, AgendaKind.Private.sessionType)
        assertEquals(app.fivvi.core.kit.SessionType.Group, AgendaKind.Group.sessionType)
        assertEquals("private", AgendaKind.Private.tagName)
        assertEquals("group", AgendaKind.Group.tagName)
    }

    @Test
    fun test_F013_design_theStripIsMondayFirstWithTodayAndTheSelectedDayMarked() {
        val dutch = content(selected = "2026-09-24")
        val strip = dutch.strip

        assertEquals(listOf(21, 22, 23, 24, 25, 26, 27), strip.map { it.number })
        assertEquals(listOf(day("2026-09-22")), strip.filter { it.isToday }.map { it.day })
        assertEquals(listOf(day("2026-09-24")), strip.filter { it.isSelected }.map { it.day })
        assertEquals(listOf("M", "D", "W", "D", "V", "Z", "Z"), strip.map { it.weekday })
        assertEquals(
            listOf("M", "T", "W", "T", "F", "S", "S"),
            content(selected = "2026-09-24", format = TestFormat.english).strip.map { it.weekday },
        )
    }

    @Test
    fun test_F013_design_theLineUnderTheStripNamesTheWeekAndItsDays() {
        val agenda = content()

        assertEquals(39, agenda.weekNumber)
        assertEquals(day("2026-09-21"), agenda.weekDays.first())
        assertEquals(day("2026-09-27"), agenda.weekDays.last())
        assertEquals("21 sep", TestFormat.dutch.dayMonth(agenda.weekDays.first()))
        assertEquals("27 sep 2026", TestFormat.dutch.dayMonthYear(agenda.weekDays.last()))
    }

    @Test
    fun test_F013_AC5_tomorrowsRowsAreTheThreeSessionsFromSevenInTheMorning() {
        val agenda = content(selected = "2026-09-23")

        assertEquals(listOf("07:00", "10:00", "17:00"), agenda.selectedRows.map { it.startText })
        assertEquals(listOf("07:00", "10:00", "17:00"), agenda.rows(day("2026-09-23")).map { it.startText })
    }

    @Test
    fun test_F013_AC6_calendarWeekAndMonthWithDstNote() {
        val thursday = at("08:35", "2026-10-22").toInstant()
        val week = content(PersonalFixtures.octoberWeeks, selected = "2026-10-22", now = thursday)

        // The week strip: dots on the busy days and the note of the day the clocks change.
        assertEquals(day("2026-10-19"), week.strip.first().day)
        assertEquals(day("2026-10-25"), week.strip.last().day)
        assertEquals(listOf(false, true, false, true, false, false, false), week.strip.map { it.dots.isNotEmpty() })
        assertEquals(listOf(AgendaClockNote(day("2026-10-25"), ClockChange.Back, "zo 25 okt")), week.clockNotes)
        assertEquals(
            "Sun 25 Oct",
            content(selected = "2026-10-22", now = thursday, format = TestFormat.english).clockNotes[0].dayText,
        )

        // A weekly class at 18:00 shows at 18:00 on 20 October and on 27 October, across the change of the clocks.
        assertEquals(listOf("18:00"), week.rows(day("2026-10-20")).map { it.startText })
        val next = content(PersonalFixtures.octoberWeeks, selected = "2026-10-29", now = thursday)
        assertEquals(listOf("18:00"), next.rows(day("2026-10-27")).map { it.startText })
        assertEquals("the next week has no note", emptyList<AgendaClockNote>(), next.clockNotes)

        // The month: October 2026 Monday first, with the days of other months dimmed.
        val month =
            content(PersonalFixtures.octoberWeeks, selected = "2026-10-22", mode = AgendaMode.Month, now = thursday)
        assertEquals(day("2026-09-28"), month.grid.first().day)
        assertEquals(day("2026-11-01"), month.grid.last().day)
        assertEquals(listOf(28, 29, 30, 1), month.grid.filter { it.isOutsideMonth }.map { it.number })
        assertEquals(35, month.grid.size)
        assertEquals("the note is on the month too", listOf(day("2026-10-25")), month.clockNotes.map { it.day })
        assertEquals("Oktober 2026", month.monthTitle)
        assertEquals(
            "October 2026",
            content(selected = "2026-10-22", mode = AgendaMode.Month, format = TestFormat.english).monthTitle,
        )
    }

    @Test
    fun test_F013_AC6_theSpringChangeHasItsOwnNote() {
        val spring = at("08:35", "2026-03-26").toInstant()

        val notes = content(emptyList(), selected = "2026-03-26", now = spring).clockNotes

        assertEquals(listOf(AgendaClockNote(day("2026-03-29"), ClockChange.Forward, "zo 29 mrt")), notes)
    }

    @Test
    fun test_F013_AC6_aWeekWithoutAChangeOfTheClocksHasNoNote() {
        assertEquals(emptyList<AgendaClockNote>(), content().clockNotes)
    }

    @Test
    fun test_F013_design_theWeekListHasADayEachAndTodayIsNamed() {
        val agenda = content()

        val sections = agenda.weekSections
        assertEquals(agenda.strip.map { it.day }, sections.map { it.day })
        assertEquals(listOf(day("2026-09-22")), sections.filter { it.isToday }.map { it.day })
        assertEquals("dinsdag 22 september", TestFormat.dutch.weekdayDay(sections[1].day))
        assertEquals("Tuesday 22 September", TestFormat.english.weekdayDay(sections[1].day))
        assertEquals(
            listOf("Anna de Vries", "Mark Jansen", "Kracht", "Kracht"),
            sections[1].rows.map { it.title },
        )
        assertEquals(
            "a day without sessions has no rows, the screen says so",
            emptyList<PersonalRow>(),
            sections[0].rows,
        )
        assertEquals(listOf(0, 4, 3, 0, 0, 0, 0), sections.map { it.rows.size })
        assertFalse(agenda.showsEmptyDay)
        assertTrue(content(selected = "2026-09-21").showsEmptyDay)
    }

    @Test
    fun test_F013_design_aRowIsTD01sRowWithTheTypeLabelOnlyWhenThereAreSeveralKinds() {
        val rows = content().rows(day("2026-09-22"))

        assertEquals(listOf("Anna de Vries", "Mark Jansen", "Kracht", "Kracht"), rows.map { it.title })
        assertTrue(rows.first().namesKind)
        assertTrue(rows.last().isCancelled)
        assertTrue("two workspaces: every row names its own", rows.all { it.showsWorkspace })
        assertEquals("Sarah Personal Training", rows.first().workspaceName)

        val solo = content(listOf(PersonalFixtures.anna), workspaceCount = 1, showsKindLabel = false)
            .rows(day("2026-09-22")).first()
        assertFalse("one kind: no label", solo.namesKind)
        assertFalse(solo.showsWorkspace)
    }

    @Test
    fun test_F013_1534_theKindLabelFollowsTheApiNotTheItemsOfTheRange() {
        // Only private sessions in the range, in a workspace that also runs classes: the API says to name the kind.
        val named = content(listOf(PersonalFixtures.anna, PersonalFixtures.mark)).rows(day("2026-09-22"))
        assertTrue(named.all { it.namesKind })

        // Private and class items in the range, and the API says no.
        val silent = content(showsKindLabel = false).rows(day("2026-09-22"))
        assertEquals(4, silent.size)
        assertTrue(silent.none { it.namesKind })
    }

    @Test
    fun test_F013_design_openGymIsNotShown() {
        val agenda = content(listOf(PersonalFixtures.anna, PersonalFixtures.openGym))

        assertEquals(listOf("Anna de Vries"), agenda.rows(day("2026-09-22")).map { it.title })
        assertEquals(listOf(AgendaKind.Private), agenda.strip.first { it.day == day("2026-09-22") }.dots)
        assertEquals(1, agenda.timeline()?.blocks?.size)
    }

    @Test
    fun test_F013_design_theDayIsATimelineOfTheSelectedDay() {
        val timeline = requireNotNull(content().timeline())

        assertEquals("08:00", timeline.hours.first())
        assertEquals(4, timeline.blocks.size)
        assertEquals(35, timeline.nowMinutes)
        assertNull(content(selected = "2026-09-21").timeline())
    }

    @Test
    fun test_F013_design_aMonthCellCountsTheDaysSessions() {
        val month = content(selected = "2026-09-22", mode = AgendaMode.Month)

        assertEquals(35, month.grid.size)
        assertEquals(3, month.grid.first { it.day == day("2026-09-22") }.count)
        assertEquals("a grid has the weekday letters of a week", 7, month.weekdayLetters.size)
    }
}
