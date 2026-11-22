package app.fivvi.pro.personal

import app.fivvi.api.models.WorkspaceCalendarSession
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.personal.StudioFixtures.idOf
import java.time.Instant
import java.util.Locale
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The Owner's Hele studio (F014 AC11, the design of DECISIONS.md §3, Android): the workspace's day as
// `GET /v1/workspaces/{id}/day` answers it becomes a team card with a lane per trainer, the next card and the rows, each
// with its trainer. The texts around them are the string catalog's and are checked, in nl-NL and en, by the Compose UI tests
// (StudioDayFlowTest); here is what the API's answer becomes.
class StudioContentTest {
    private val dutch = Locale.forLanguageTag("nl-NL")
    private val workspace = UUID.nameUUIDFromBytes("studio:john's gym".toByteArray())

    private fun content(
        day: app.fivvi.api.models.WorkspaceDay = StudioFixtures.johnsDay(),
        now: Instant = PersonalFixtures.now,
        own: UUID? = StudioFixtures.john.id,
    ) = StudioContent(day, workspace, "John's Gym", own, now, dutch)

    private fun team(content: StudioContent = content()) = content.team

    private fun timeline(content: StudioContent = content()) = requireNotNull(team(content).timeline)

    @Test
    fun test_F014_AC11_theTeamCardNamesTheBusiestMomentAndHasALanePerTrainer() {
        val team = team()

        assertEquals(3, team.trainers)
        assertEquals("Drukst 18:00–19:00 · 2 tegelijk", StudioBusiest("18:00", "19:00", 2), team.busiest)
        val lanes = requireNotNull(team.timeline).lanes
        assertEquals(
            "the Owner first as Jij, then the others by name",
            listOf("Jij", "Sarah", "Tom"),
            lanes.map { if (it.isOwn) "Jij" else it.firstName },
        )
        assertEquals(listOf(true, false, false), lanes.map { it.isOwn })
        assertEquals(
            listOf(listOf("anna"), listOf("mark", "kracht", "boxing"), listOf("lisa")),
            lanes.map { lane -> lane.blocks.map { b -> StudioFixtures.names.getValue(b.row.id) } },
        )
        assertEquals("the avatar of the person, not of the label", "Sarah de Boer", lanes[1].trainerName)
    }

    @Test
    fun test_F014_AC11_aDayWithoutOverlapSaysSo() {
        val apart = StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, StudioFixtures.lisa), busiest = null)

        assertNull("Geen overlap", team(content(apart)).busiest)
        assertNotNull(team(content(apart)).timeline)
    }

    @Test
    fun test_F014_AC11_theBusiestMomentIsWordedInTheWorkspacesTimeZoneOfTheAnswer() {
        val utc = app.fivvi.api.models.WorkspaceBusiestMoment(
            at("18:00").withOffsetSameInstant(java.time.ZoneOffset.UTC),
            at("19:00").withOffsetSameInstant(java.time.ZoneOffset.UTC),
            "Europe/Amsterdam",
            2,
        )

        val busiest = team(content(StudioFixtures.johnsDay(busiest = utc))).busiest

        assertEquals(StudioBusiest("18:00", "19:00", 2), busiest)
    }

    @Test
    fun test_F014_AC11_theBlocksSitAlongAnAxisOfThreeHoursAndPastOnesAreDimmed() {
        val timeline = timeline()

        assertEquals(
            "from the first hour, every 3 h",
            listOf("07", "10", "13", "16", "19"),
            timeline.ticks.map {
                it.label
            },
        )
        assertEquals(listOf(0.0, 0.25, 0.5, 0.75, 1.0), timeline.ticks.map { it.fraction })
        val mark = timeline.lanes[1].blocks[0]
        assertEquals(0.0, mark.left, 0.0001)
        assertEquals("one hour of twelve", 1.0 / 12, mark.width, 0.0001)
        assertTrue("ended at 08:00; it is 08:35", mark.isPast)
        assertFalse(timeline.lanes[1].blocks[1].isPast)
        assertEquals("the now-line at 08:35", (35.0 / 60 + 1) / 12, requireNotNull(timeline.nowFraction), 0.0001)
        assertNull("no now-line outside the axis", timeline(content(now = at("06:00").toInstant())).nowFraction)
        assertNull("not on another day", timeline(content(now = at("08:35", "2026-09-23").toInstant())).nowFraction)
    }

    @Test
    fun test_F014_AC11_sessionsOfOneTrainerAtTheSameTimeAreStackedInTheLane() {
        val double = StudioFixtures.session("double", "07:30", "08:30", StudioFixtures.sarah, client = "Lisa Smit")
        val day = StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, double), busiest = null)

        val lane = timeline(content(day)).lanes[0]

        assertEquals(listOf(0, 1), lane.blocks.map { it.stack })
        assertEquals(2, lane.rowCount)
    }

    @Test
    fun test_F014_AC11_aBlockOpensItsSessionAndKnowsItsTrainerAndTitle() {
        val kracht = timeline().lanes[1].blocks[1]

        assertEquals("Kracht", kracht.row.title)
        assertEquals("10:00", kracht.row.startText)
        assertEquals("Sarah de Boer", kracht.trainerName)
        assertEquals("it opens TD-03", idOf("kracht"), kracht.row.id)
        assertTrue(kracht.row.isGroup)
        assertEquals("in the current workspace", workspace, kracht.row.workspaceId)
        assertFalse(timeline().lanes[1].blocks[0].row.isGroup)
    }

    @Test
    fun test_F014_AC11_aCancelledSessionIsNoBlockAndSessionsWithoutATrainerGetTheLastLane() {
        val nobody = StudioFixtures.session("yoga", "09:00", "10:00", className = "Yoga")
        val day = StudioFixtures.johnsDay(
            items = listOf(StudioFixtures.mark, nobody, StudioFixtures.krachtCancelled),
            busiest = null,
        )

        val team = team(content(day))
        val lanes = requireNotNull(team.timeline).lanes

        assertEquals(
            "Tom's only session is cancelled",
            listOf(listOf("mark"), listOf("yoga")),
            lanes.map { lane -> lane.blocks.map { StudioFixtures.names.getValue(it.row.id) } },
        )
        assertNull("no avatar for nobody", lanes[1].trainerName)
        assertEquals("the lane of nobody is no trainer", 1, team.trainers)
    }

    @Test
    fun test_F014_AC11_aDayWithoutSessionsSaysSoInTheTeamCard() {
        val empty = content(StudioFixtures.emptyDay)

        assertNull(team(empty).timeline)
        assertNull(team(empty).busiest)
        assertEquals(0, team(empty).trainers)
        assertTrue(empty.rows.isEmpty())
        assertNull(empty.next)
    }

    @Test
    fun test_F014_AC11_openGymIsLeftOut() {
        val gym = StudioFixtures.session("gym", "09:00", "10:00", StudioFixtures.sarah, client = "x")
            .copy(type = WorkspaceCalendarSession.Type.OPEN_GYM)
        val day = StudioFixtures.johnsDay(items = listOf(gym), busiest = null)

        assertNull(team(content(day)).timeline)
        assertTrue(content(day).rows.isEmpty())
    }

    @Test
    fun test_F014_AC11_anOwnerWhoDoesNotTrainHasNoLaneOfHerOwn() {
        val day = StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, StudioFixtures.lisa), busiest = null)

        val lanes = timeline(content(day)).lanes

        assertEquals("no Jij", listOf(false, false), lanes.map { it.isOwn })
    }

    @Test
    fun test_F014_AC11_theRowsShowTheirTrainerAndTheNextCardNamesIt() {
        val content = content()

        val next = requireNotNull(content.next)

        assertEquals("the first session that has not ended, at 08:35", idOf("kracht"), next.row.id)
        assertEquals(PersonalTrainer.Named("Sarah de Boer"), next.row.trainer)
        assertEquals(85, next.minutesAt(PersonalFixtures.now))
        assertEquals(
            "the next is not repeated",
            listOf("mark", "lisa", "anna", "boxing", "kracht-late"),
            content.rows.map { StudioFixtures.names.getValue(it.id) },
        )
        assertEquals(
            listOf(
                PersonalTrainer.Named("Sarah de Boer"),
                PersonalTrainer.Named("Tom Bakker"),
                PersonalTrainer.You,
                PersonalTrainer.Named("Sarah de Boer"),
                PersonalTrainer.Named("Tom Bakker"),
            ),
            content.rows.map { it.trainer },
        )
        assertTrue(content.rows[0].isPast)
        assertTrue(content.rows[4].isCancelled)
        assertFalse("one workspace: no name and no dot", content.rows[0].showsWorkspace)
    }

    @Test
    fun test_F014_AC11_theOwnersOwnSessionIsHersAndASessionWithNoTrainerSaysNone() {
        val nobody = StudioFixtures.session("yoga", "09:00", "10:00", className = "Yoga")
        val day = StudioFixtures.johnsDay(items = listOf(StudioFixtures.anna, nobody), busiest = null)

        val rows = content(day, now = at("17:30").toInstant()).let { listOf(requireNotNull(it.next).row) + it.rows }

        assertEquals(PersonalTrainer.You, rows[0].trainer)
        assertEquals(PersonalTrainer.Nobody, rows[1].trainer)
    }

    @Test
    fun test_F014_AC11_anInProgressSessionIsNextWithoutACountdown() {
        val content = content(now = at("10:20").toInstant())

        assertNull(requireNotNull(content.next).minutesAt(at("10:20").toInstant()))
    }
}
