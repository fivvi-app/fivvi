package app.fivvi.pro.personal

import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.MySessions
import app.fivvi.pro.personal.PersonalFixtures.johns
import app.fivvi.pro.personal.PersonalFixtures.sarahPT
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// F067 (spec #587): the rows of Vandaag, Agenda and Hele studio carry the level of a class date, for the compact bars after
// the class name. *Alle niveaus* and *Geen* show no icon in a list, and neither does a private session; the level comes from
// the API's answer (F013's My day and My sessions, F014's day of a workspace), read-only for every role.
class PersonalRowLevelTest {
    private val gevorderd = PersonalFixtures.session(
        "reformer",
        johns,
        "15:00",
        "16:00",
        className = "Reformer Power",
        booked = 2,
        capacity = 8,
        level = ClassLevel.ADVANCED,
    )

    private fun todayRows(vararg items: app.fivvi.api.models.PersonalSession) =
        TodayContent(PersonalFixtures.sarah(items = items.toList()), PersonalFixtures.now, TestFormat.dutch).let {
            listOfNotNull(it.next?.row) + it.rows
        }.associateBy { it.id }

    @Test
    fun test_F067_AC5_aClassRowOfVandaagCarriesTheLevelOfTheDate() {
        val rows = todayRows(PersonalFixtures.anna, gevorderd)

        assertEquals(ClassLevel.ADVANCED, rows.getValue(gevorderd.sessionId).level)
    }

    @Test
    fun test_F067_AC6_aRowShowsNoLevelForGeenAlleNiveausOrAPrivateSession() {
        val alle = PersonalFixtures.session(
            "alle",
            johns,
            "17:00",
            "18:00",
            className = "Kracht",
            booked = 0,
            capacity = 8,
            level = ClassLevel.ALL_LEVELS,
        )
        val geen = PersonalFixtures.session(
            "geen",
            johns,
            "19:00",
            "20:00",
            className = "Boksen",
            booked = 0,
            capacity = 8,
        )
        // A private session never has a level, whatever a stray answer says.
        val strayPrivate = PersonalFixtures.session(
            "stray",
            sarahPT,
            "09:00",
            "10:00",
            client = "Anna de Vries",
            level = ClassLevel.BEGINNER,
        )

        val rows = todayRows(strayPrivate, alle, geen)

        assertNull(rows.getValue(alle.sessionId).level)
        assertNull(rows.getValue(geen.sessionId).level)
        assertNull(rows.getValue(strayPrivate.sessionId).level)
    }

    @Test
    fun test_F067_AC5_everyLevelWithARankIsKeptAsItIs() {
        val items = listOf(ClassLevel.BEGINNER, ClassLevel.INTERMEDIATE, ClassLevel.ADVANCED).mapIndexed {
                index,
                level,
            ->
            PersonalFixtures.session(
                "l$index",
                johns,
                "1$index:00",
                "1$index:45",
                className = "Les $index",
                booked = 0,
                capacity = 8,
                level = level,
            )
        }

        val rows = todayRows(*items.toTypedArray())

        assertEquals(
            listOf(ClassLevel.BEGINNER, ClassLevel.INTERMEDIATE, ClassLevel.ADVANCED),
            items.map { rows.getValue(it.sessionId).level },
        )
    }

    @Test
    fun test_F067_AC5_aRowOfAgendaCarriesTheLevelToo() {
        val day = LocalDate.parse("2026-09-22")
        val base = AgendaState(mode = AgendaMode.Week, selectedDay = day, now = PersonalFixtures.now)
        val response = MySessions(
            base.range.from.toString(),
            base.range.until.toString(),
            "Europe/Amsterdam",
            2,
            PersonalFixtures.sessionTypes(2, true),
            true,
            listOf(PersonalFixtures.anna, gevorderd),
        )
        val state = base.copy(
            loaded = mapOf(base.range to AgendaRead(response, PersonalFixtures.now)),
            results = mapOf(base.range to AgendaResult.Success),
        )

        val rows = AgendaContent(state, PersonalFixtures.now, TestFormat.dutch).weekSections.flatMap { it.rows }

        assertEquals(
            listOf(null, ClassLevel.ADVANCED),
            rows.filter {
                it.id in
                    listOf(PersonalFixtures.anna.sessionId, gevorderd.sessionId)
            }.map { it.level },
        )
    }

    @Test
    fun test_F067_AC5_aRowOfHeleStudioCarriesTheLevelOfTheWorkspacesDay() {
        val reformer = StudioFixtures.session(
            "reformer",
            "15:00",
            "16:00",
            StudioFixtures.sarah,
            className = "Reformer Power",
            level = ClassLevel.ADVANCED,
        )
        val alle = StudioFixtures.session(
            "alle",
            "17:00",
            "18:00",
            StudioFixtures.tom,
            className = "Kracht",
            level = ClassLevel.ALL_LEVELS,
        )
        val day = StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, reformer, alle))
        val content =
            StudioContent(
                day,
                UUID.randomUUID(),
                "John's Gym",
                StudioFixtures.john.id,
                PersonalFixtures.now,
                Locale.forLanguageTag("nl-NL"),
            )

        val rows = (listOfNotNull(content.next?.row) + content.rows).associateBy { it.id }

        assertEquals(ClassLevel.ADVANCED, rows.getValue(reformer.id).level)
        assertNull(rows.getValue(alle.id).level)
        assertNull(rows.getValue(StudioFixtures.mark.id).level)
    }
}
