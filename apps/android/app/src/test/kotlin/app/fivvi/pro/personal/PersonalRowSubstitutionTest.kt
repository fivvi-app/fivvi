package app.fivvi.pro.personal

import app.fivvi.api.models.MyDay
import app.fivvi.api.models.PersonalSession
import app.fivvi.pro.personal.PersonalFixtures.at
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The substitution on the rows of Vandaag and Agenda (F024 AC4, Android): the covering trainer's row says who she replaces,
// the replaced trainer's row stays, dimmed, with who took it over, and is not counted. The words around the names are the
// string catalog's and are checked, in nl-NL and en, by the Compose UI tests (SubstitutionScreenTest).
class PersonalRowSubstitutionTest {
    private val october = at("08:35", "2026-10-20").toInstant()

    private fun builder() = PersonalRows(true, 1, october, TestFormat.dutch)

    @Test
    fun test_F024_AC4_theCoveringRowNamesTheTrainerSheReplacesAndIsNotDimmed() {
        val row = builder().row(PersonalFixtures.covering)

        assertEquals(PersonalSubstitution.CoveringFor("Sarah Visser"), row.substitution)
        assertFalse(row.isTakenOver)
    }

    @Test
    fun test_F024_AC4_theTakenOverRowNamesTheSubstituteAndIsDimmed() {
        val row = builder().row(PersonalFixtures.takenOver)

        assertEquals(PersonalSubstitution.TakenOverBy("Mike Bakker"), row.substitution)
        assertTrue(row.isTakenOver)
    }

    @Test
    fun test_F024_AC4_aDateTakenOverByAnAccountWithoutANameIsStillTakenOverButSaysNoName() {
        val row = builder().row(
            PersonalFixtures.session(
                "away",
                PersonalFixtures.johns,
                "18:00",
                "19:00",
                className = "Kracht",
                takenOverBy = "",
            ),
        )

        assertTrue("dimmed, without actions", row.isTakenOver)
        assertNull("no name to say", row.substitution)
    }

    @Test
    fun test_F024_AC4_aDateTheAccountTeachesHasNoSubstitutionLine() {
        val row = PersonalRows(true, 1, PersonalFixtures.now, TestFormat.dutch).row(PersonalFixtures.kracht)

        assertNull(row.substitution)
        assertFalse(row.isTakenOver)
    }

    @Test
    fun test_F024_AC4_vandaagListsBothRowsAndTheTakenOverOneIsNotTheNext() {
        // The API leaves a taken-over date out of the summary and Straks: here the day's `next` is Anna, as the API sends it.
        val day: MyDay = PersonalFixtures.sarah(
            items = listOf(PersonalFixtures.anna, PersonalFixtures.covering, PersonalFixtures.takenOver),
        )

        val content = TodayContent(day, PersonalFixtures.now, TestFormat.dutch)

        assertEquals(PersonalFixtures.anna.sessionId, content.next?.row?.id)
        assertEquals(
            listOf(
                PersonalSubstitution.CoveringFor("Sarah Visser"),
                PersonalSubstitution.TakenOverBy("Mike Bakker"),
            ),
            content.rows.map { it.substitution },
        )
        assertEquals(listOf(false, true), content.rows.map { it.isTakenOver })
    }

    @Test
    fun test_F024_AC4_1649_theNextCardOfTheCoveringTrainerNamesTheTrainerSheReplaces() {
        // On 20 October before 19:00 Kracht is Mike's next class: the card is the only place Vandaag shows it (#1649).
        val day: MyDay = PersonalFixtures.sarah(items = listOf(PersonalFixtures.covering), workspaceCount = 1)
            .copy(date = "2026-10-20")

        val content = TodayContent(day, october, TestFormat.dutch)

        assertEquals(PersonalFixtures.covering.sessionId, content.next?.row?.id)
        assertEquals(PersonalSubstitution.CoveringFor("Sarah Visser"), content.next?.row?.substitution)
        assertTrue("the rows leave the next item out", content.rows.isEmpty())
    }

    @Test
    fun test_F024_AC4_1649_theNextCardOfADateWithoutASubstitutionHasNone() {
        val content = TodayContent(PersonalFixtures.sarah(), PersonalFixtures.now, TestFormat.dutch)

        assertNull(content.next?.row?.substitution)
    }

    private fun agenda(vararg items: PersonalSession): AgendaContent {
        val base = AgendaState(mode = AgendaMode.Week, selectedDay = LocalDate.parse("2026-10-20"), now = october)
        val response = app.fivvi.api.models.MySessions(
            base.range.from.toString(),
            base.range.until.toString(),
            "Europe/Amsterdam",
            1,
            PersonalFixtures.sessionTypes(1, true),
            true,
            items.toList(),
        )
        val state = base.copy(
            loaded = mapOf(base.range to AgendaRead(response, october)),
            results = mapOf(base.range to AgendaResult.Success),
        )
        return AgendaContent(state, october, TestFormat.dutch)
    }

    @Test
    fun test_F024_AC4_agendaShowsTheSameLabelsOnTheRowsOfTheDay() {
        assertEquals(
            PersonalSubstitution.CoveringFor("Sarah Visser"),
            agenda(PersonalFixtures.covering).selectedRows.single().substitution,
        )
        assertEquals(
            PersonalSubstitution.TakenOverBy("Mike Bakker"),
            agenda(PersonalFixtures.takenOver).selectedRows.single().substitution,
        )
    }

    @Test
    fun test_F024_AC4_aDateTakenOverHasNoDotAndNoCountInAgendaButACoveredOneHasBoth() {
        val covered = agenda(PersonalFixtures.covering).strip.first { it.day == LocalDate.parse("2026-10-20") }
        assertEquals(listOf(AgendaKind.Group), covered.dots)
        assertEquals(1, covered.count)

        val away = agenda(PersonalFixtures.takenOver).strip.first { it.day == LocalDate.parse("2026-10-20") }
        assertEquals("not counted as one of hers", emptyList<AgendaKind>(), away.dots)
        assertEquals(0, away.count)
        assertEquals(
            "the month grid agrees",
            emptyList<AgendaKind>(),
            agenda(PersonalFixtures.takenOver).grid.first { it.day == LocalDate.parse("2026-10-20") }.dots,
        )
    }

    @Test
    fun test_F024_AC4_theDayTimelineKeepsTheTakenOverBlockWithItsRow() {
        val timeline = requireNotNull(agenda(PersonalFixtures.takenOver).timeline())

        val block = timeline.blocks.single()
        assertTrue(block.row.isTakenOver)
        assertEquals(PersonalSubstitution.TakenOverBy("Mike Bakker"), block.row.substitution)
    }
}
