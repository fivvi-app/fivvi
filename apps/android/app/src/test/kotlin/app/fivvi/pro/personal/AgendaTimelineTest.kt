package app.fivvi.pro.personal

import app.fivvi.api.models.PersonalSession
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.sessions.SessionFormat
import java.time.Instant
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The timeline of *Dag* on Agenda (TD-04, `DECISIONS.md` §3, Android): an hour a row, each session a block in its type's
// colour, sessions at the same time side by side, and the now-line on today. Only where a block sits is decided here.
class AgendaTimelineTest {
    private val calendar = AgendaCalendar(PersonalRows.TIME_ZONE)
    private val format = SessionFormat(Locale.forLanguageTag("nl-NL"), PersonalRows.TIME_ZONE)

    /** A day that is not the day of `PersonalFixtures.now`, so there is no now-line on it. */
    private val elsewhere: Instant = at("08:35", "2026-09-30").toInstant()

    private fun timeline(
        items: List<PersonalSession>,
        now: Instant = PersonalFixtures.now,
        day: String = PersonalFixtures.DAY,
    ): AgendaTimeline? {
        val rows = PersonalRows(items, 2, now, format)
        val entries = items.map { AgendaTimeline.Entry(rows.row(it), it.startsAt, it.endsAt) }
        return AgendaTimeline.make(entries, java.time.LocalDate.parse(day), now, calendar)
    }

    /** A private session of John's Gym. */
    private fun visit(
        id: String,
        start: String,
        end: String,
        client: String = "Eva Kok",
        day: String = PersonalFixtures.DAY,
    ) = PersonalFixtures.session(id, PersonalFixtures.johns, start, end, client = client, day = day)

    private fun AgendaTimeline.byId() = blocks.associateBy { it.row.id }

    private fun id(name: String) = PersonalFixtures.sessionIdOf(name)

    @Test
    fun test_F013_design_theHoursRunFromTheFirstToTheLastHourOfTheDay() {
        val timeline = requireNotNull(timeline(listOf(PersonalFixtures.mark, PersonalFixtures.kracht), now = elsewhere))

        assertEquals((11..16).map { "%02d:00".format(it) }, timeline.hours)
        assertEquals(listOf(id("mark"), id("kracht")), timeline.blocks.map { it.row.id })
        assertEquals("11:00 is the first row", 0, timeline.blocks[0].top)
        assertEquals(60, timeline.blocks[0].length)
        assertEquals("15:00 is four hours down", 4 * 60, timeline.blocks[1].top)
    }

    @Test
    fun test_F013_design_aSessionOfHalfAnHourIsPlacedByMinutes() {
        val timeline = requireNotNull(timeline(listOf(visit("short", "09:15", "09:45")), now = elsewhere))

        assertEquals(listOf("09:00", "10:00"), timeline.hours)
        assertEquals(15, timeline.blocks[0].top)
        assertEquals(30, timeline.blocks[0].length)
    }

    @Test
    fun test_F013_design_twoSessionsAtTheSameTimeSitSideBySide() {
        val lisa = visit("lisa", "11:00", "12:00", client = "Lisa Smit")
        val day = listOf(PersonalFixtures.anna, PersonalFixtures.mark, lisa, PersonalFixtures.kracht)
        val byId = requireNotNull(timeline(day)).byId()

        assertEquals(listOf(0, 1), listOf(byId.getValue(id("mark")).column, byId.getValue(id("lisa")).column))
        assertEquals(listOf(2, 2), listOf(byId.getValue(id("mark")).columns, byId.getValue(id("lisa")).columns))
        assertEquals(
            "a session on its own takes the width",
            listOf(0, 1),
            listOf(byId.getValue(id("anna")).column, byId.getValue(id("anna")).columns),
        )
        assertEquals(listOf(0, 1), listOf(byId.getValue(id("kracht")).column, byId.getValue(id("kracht")).columns))
    }

    @Test
    fun test_F013_design_aChainOfOverlapsSharesOneWidthAndAFreeColumnIsUsedAgain() {
        val day = listOf(
            visit("one", "09:00", "10:00"),
            visit("two", "09:30", "10:30"),
            visit("three", "10:15", "11:00"),
            visit("next", "11:00", "12:00"),
        )
        val byId = requireNotNull(timeline(day)).byId()

        assertEquals(0, byId.getValue(id("one")).column)
        assertEquals(1, byId.getValue(id("two")).column)
        assertEquals("the first one has ended", 0, byId.getValue(id("three")).column)
        assertEquals(
            listOf(2, 2, 2),
            listOf("one", "two", "three").map { byId.getValue(id(it)).columns },
        )
        assertEquals(
            "one that starts as the last ends is alone",
            listOf(0, 1),
            listOf(byId.getValue(id("next")).column, byId.getValue(id("next")).columns),
        )
    }

    @Test
    fun test_F013_design_theNowLineIsOnTodayAndTheRowsReachIt() {
        // 08:35, before the first session at 09:00: the rows start at 08:00 so the line is on them.
        val sarah = listOf(
            PersonalFixtures.anna,
            PersonalFixtures.mark,
            PersonalFixtures.kracht,
            PersonalFixtures.krachtCancelled,
        )
        val today = requireNotNull(timeline(sarah))

        assertEquals("08:00", today.hours.first())
        assertEquals("19:00", today.hours.last())
        assertEquals(35, today.nowMinutes)

        val later = requireNotNull(timeline(listOf(PersonalFixtures.anna), now = at("21:10").toInstant()))
        assertEquals("after the last session the rows reach the hour of now", "22:00", later.hours.last())
        assertEquals((21 - 9) * 60 + 10, later.nowMinutes)

        val other = requireNotNull(
            timeline(listOf(visit("other", "09:00", "10:00", day = "2026-09-23")), day = "2026-09-23"),
        )
        assertNull("a day that is not today has no now-line", other.nowMinutes)
        assertEquals("and its rows are those of its sessions", "09:00", other.hours.first())
    }

    @Test
    fun test_F013_design_aCancelledSessionKeepsItsBlockMarked() {
        val timeline = requireNotNull(timeline(listOf(PersonalFixtures.krachtCancelled), now = elsewhere))

        assertEquals(1, timeline.blocks.size)
        assertTrue(timeline.blocks[0].row.isCancelled)
    }

    @Test
    fun test_F013_design_aDayWithoutSessionsHasNoTimeline() {
        assertNull(timeline(emptyList()))
    }

    @Test
    fun test_F013_AC6_aSessionIsPlacedByItsWallClockOnTheDayTheClocksChange() {
        // 25 October 2026 is 25 hours long: 18:00 is still 18:00 on the wall clock.
        val dst = visit("dst", "18:00", "19:00", day = "2026-10-25")
        val timeline = requireNotNull(timeline(listOf(dst), now = elsewhere, day = "2026-10-25"))

        assertEquals("18:00", timeline.hours.first())
        assertEquals(60, timeline.blocks[0].length)
    }

    // A block of 30 minutes is 32 dp tall, which is under the 48 dp a touch needs: its hit area grows, its look does not.
    @Test
    fun test_F013_design_aShortBlockHasAHitAreaOfAtLeast48dp() {
        val short = AgendaTimeline.BlockMetrics(minutes = 30)
        assertEquals("the look keeps the minute scale, with its floor", 32f, short.height, 0.01f)
        assertTrue(short.touchHeight >= 48f)
        assertEquals(
            "the room is shared above and below",
            2 * short.touchInset,
            short.touchHeight - short.height,
            0.01f,
        )

        val tiny = AgendaTimeline.BlockMetrics(minutes = 5)
        assertEquals(32f, tiny.height, 0.01f)
        assertTrue(tiny.touchHeight >= 48f)

        val hour = AgendaTimeline.BlockMetrics(minutes = 60)
        assertEquals("an hour is the scale less the gap", 61f, hour.height, 0.01f)
        assertEquals("a block that is tall enough grows nothing", 61f, hour.touchHeight, 0.01f)
        assertEquals(0f, hour.touchInset, 0f)
    }

    /** The visible block and the hit area of [block], as ranges of dp down the day. */
    private fun extent(
        timeline: AgendaTimeline,
        block: AgendaTimeline.Block,
    ): Pair<ClosedFloatingPointRange<Float>, ClosedFloatingPointRange<Float>> {
        val metrics = timeline.metrics(block)
        val top = block.top / 60f * AgendaTimeline.HOUR_HEIGHT
        val visible = top..(top + metrics.height)
        return visible to ((top - metrics.touchAbove)..(visible.endInclusive + metrics.touchBelow))
    }

    // Two 30-minute sessions one after the other: B is drawn over A, so a hit area grown into A would take the touch of A's
    // lower part. No hit area covers another block's visible block, and each block keeps its own.
    @Test
    fun test_F013_design_theHitAreaOfAShortBlockNeverCoversTheBlockBesideIt() {
        val day = listOf(visit("a", "11:00", "11:30"), visit("b", "11:30", "12:00"))
        val timeline = requireNotNull(timeline(day, now = elsewhere))
        assertEquals(2, timeline.blocks.size)
        assertEquals("one after the other, in one column", listOf(0, 0), timeline.blocks.map { it.column })

        for ((block, other) in listOf(
            timeline.blocks[0] to timeline.blocks[1],
            timeline.blocks[1] to timeline.blocks[0],
        )) {
            val (mineVisible, mineTouch) = extent(timeline, block)
            val (theirsVisible, _) = extent(timeline, other)
            assertTrue("the block itself stays tappable", mineTouch.start <= mineVisible.start)
            assertTrue(mineTouch.endInclusive >= mineVisible.endInclusive)
            val overlap = minOf(mineTouch.endInclusive, theirsVisible.endInclusive) -
                maxOf(mineTouch.start, theirsVisible.start)
            assertTrue("a hit area covers the block beside it", overlap <= 0.001f)
        }
    }

    // With room between two blocks of a column, each takes at most half of it; beside nothing the whole 48 dp is kept.
    @Test
    fun test_F013_design_aShortBlockWithRoomAroundItGrowsIntoItHalfEach() {
        val day = listOf(visit("a", "11:00", "11:30"), visit("b", "12:00", "12:30"), visit("c", "14:00", "14:30"))
        val timeline = requireNotNull(timeline(day, now = elsewhere))
        val metrics = timeline.blocks.associate { it.row.id to timeline.metrics(it) }

        assertEquals(
            "a wants 8 dp below it and the room is 32 dp: it has them",
            8f,
            metrics.getValue(id("a")).touchBelow,
            0.01f,
        )
        assertTrue("a lone block keeps the whole 48 dp", metrics.getValue(id("c")).touchHeight >= 48f)

        val close =
            requireNotNull(
                timeline(listOf(visit("a", "11:00", "11:30"), visit("b", "11:40", "12:10")), now = elsewhere),
            )
        val first = close.metrics(close.blocks[0])
        assertEquals("half of the room between them", (64f * 40 / 60 - 32f) / 2, first.touchBelow, 0.01f)
    }

    // Spec #457 / #1556: a block is drawn at least as tall as its minimum, so a session under half an hour followed at once by
    // another is drawn over it. Both twins (Android and iOS) place blocks by their drawn height, so the columns follow what is drawn.
    @Test
    fun test_F013_design_aShortSessionAndTheNextOneThatOverlapsItsDrawnBlockSitSideBySide() {
        val day = listOf(visit("short", "11:00", "11:15"), visit("next", "11:20", "12:20"))
        val timeline = requireNotNull(timeline(day, now = elsewhere))
        val byId = timeline.byId()

        assertEquals("the real sessions do not overlap, their drawn blocks do", 15, byId.getValue(id("short")).length)
        assertEquals(listOf(0, 1), listOf(byId.getValue(id("short")).column, byId.getValue(id("next")).column))
        assertEquals(listOf(2, 2), listOf(byId.getValue(id("short")).columns, byId.getValue(id("next")).columns))
    }

    @Test
    fun test_F013_design_aShortSessionFollowedByAnotherAfterItsDrawnBlockKeepsTheWidth() {
        val day = listOf(visit("short", "11:00", "11:15"), visit("next", "11:30", "12:30"))
        val timeline = requireNotNull(timeline(day, now = elsewhere))

        assertEquals("the 30-minute block of the short one has ended", listOf(0, 0), timeline.blocks.map { it.column })
        assertEquals(listOf(1, 1), timeline.blocks.map { it.columns })
    }

    // The invariant behind both: whatever the sessions are, no two blocks that share any width are drawn over each other.
    @Test
    fun test_F013_design_noTwoDrawnBlocksOfTheDayCoverEachOther() {
        for (gap in 0..90 step 5) {
            for (firstLength in listOf(5, 15, 25, 30, 45, 60)) {
                for (secondLength in listOf(5, 15, 30, 60)) {
                    val start = 9 * 60
                    val day = listOf(
                        visit("a", clock(start), clock(start + firstLength)),
                        visit("b", clock(start + gap), clock(start + gap + secondLength)),
                        visit("c", clock(start + gap / 2), clock(start + gap / 2 + 20)),
                    )
                    val timeline = requireNotNull(timeline(day, now = elsewhere))
                    val drawn = timeline.blocks.map { block ->
                        val top = block.top / 60f * AgendaTimeline.HOUR_HEIGHT
                        Triple(block, top, top + timeline.metrics(block).height)
                    }
                    for (i in drawn.indices) {
                        for (j in i + 1 until drawn.size) {
                            val (a, aTop, aBottom) = drawn[i]
                            val (b, bTop, bBottom) = drawn[j]
                            val sharesWidth = a.column * b.columns < (b.column + 1) * a.columns &&
                                b.column * a.columns < (a.column + 1) * b.columns
                            if (!sharesWidth) continue
                            assertTrue(
                                "gap $gap, lengths $firstLength/$secondLength: ${a.row.title} and ${b.row.title} overlap",
                                aBottom <= bTop + 0.001f || bBottom <= aTop + 0.001f,
                            )
                        }
                    }
                }
            }
        }
    }

    @Test
    fun test_F013_design_theRowsReachTheEndOfADrawnBlockThatRunsPastTheLastHour() {
        // A 10-minute session at 23:50 is drawn 30 minutes tall: the rows end at midnight and the block is not cut off.
        val timeline = requireNotNull(timeline(listOf(visit("late", "23:50", "23:59")), now = elsewhere))

        assertEquals("00:00", timeline.hours.last())
        assertNotNull(timeline.blocks.single())
        assertTrue(timeline.overflowMinutes > 0)
    }

    private fun clock(minutes: Int) = "%02d:%02d".format(minutes / 60, minutes % 60)
}
