package app.fivvi.pro.personal

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * *Dag* on Agenda (TD-04, `DECISIONS.md` §3): the selected day as a timeline with an hour a row, from the first to the last
 * hour of the day, each session a block, sessions at the same time side by side and the now-line on today. Only where a
 * block sits is decided here (minutes from the first row, its column); the sessions are the API's. All lengths are dp.
 *
 * A block is drawn at least [MINIMUM_HEIGHT] tall, so a title still fits, and that is what decides the columns: two blocks
 * that are drawn over each other sit side by side, also when the sessions themselves don't overlap (a session of 15
 * minutes is drawn as 30). The iOS twin splits by the sessions' own times and draws such a block under the next one
 * (#1556); Android never does.
 */
data class AgendaTimeline(
    /** The labels of the hour lines, *09:00*, from the first to the last. */
    val hours: List<String>,
    val blocks: List<Block>,
    /** Where the now-line sits, in minutes from the first row: on today only. */
    val nowMinutes: Int?,
    /** The minutes a block is drawn past the last row, so the rows can leave room for it. */
    val overflowMinutes: Int = 0,
) {
    /** A session to place: its row, and the instants that say where it sits. */
    class Entry(val row: PersonalRow, val startsAt: OffsetDateTime, val endsAt: OffsetDateTime)

    data class Block(
        /** The session as a row: a block opens TD-02 or TD-03 by it. */
        val row: PersonalRow,
        /** Where it starts and how long it is, in minutes from the first row. */
        val top: Int,
        val length: Int,
        /** The column it takes of the [columns] that the sessions drawn over each other share the width of the day in. */
        val column: Int,
        val columns: Int,
    ) {
        /** Whether the two take any of the same width of the day (a column of `columns` is a `1/columns` slice of it). */
        fun sharesWidth(other: Block): Boolean = column * other.columns < (other.column + 1) * columns &&
            other.column * columns < (column + 1) * other.columns
    }

    /** The minutes the rows span. */
    val totalMinutes: Int get() = (hours.size - 1) * MINUTES_PER_HOUR

    /**
     * How tall a block looks and how much of the day it may be touched on. The look follows the minute scale (with a floor
     * so a title still fits); a block under the 48 dp of a touch (Material) gets its hit area grown above and below it, so
     * the look and the scale stay. The hit area never goes past half of the room to the block beside it, so it never covers
     * another block. [roomAbove] and [roomBelow] are the free dp to the nearest block over the same part of the width
     * (`null` for none).
     */
    class BlockMetrics(minutes: Int, roomAbove: Float? = null, roomBelow: Float? = null) {
        val height: Float = heightOf(minutes)

        /** What is wanted above and below the block to reach the touch size. */
        val touchInset: Float = max(0f, (TOUCH_MINIMUM - height) / 2)

        /** What is added above and below it: [touchInset], or less where a block is near. */
        val touchAbove: Float = roomAbove?.let { min(touchInset, max(0f, it) / 2) } ?: touchInset
        val touchBelow: Float = roomBelow?.let { min(touchInset, max(0f, it) / 2) } ?: touchInset

        val touchHeight: Float get() = height + touchAbove + touchBelow
    }

    /** The look and the hit area of [block], with the room to the blocks over the same part of the width. */
    fun metrics(block: Block): BlockMetrics {
        fun top(block: Block) = block.top / MINUTES_PER_HOUR_F * HOUR_HEIGHT

        fun bottom(block: Block) = top(block) + heightOf(block.length)
        val beside = blocks.filter { it !== block && it.sharesWidth(block) }
        val roomAbove = beside.filter { it.top <= block.top }.minOfOrNull { top(block) - bottom(it) }
        val roomBelow = beside.filter { it.top > block.top }.minOfOrNull { top(it) - bottom(block) }
        return BlockMetrics(block.length, roomAbove, roomBelow)
    }

    private class Placed(val entry: Entry, val start: Int, val end: Int, val drawnEnd: Int)

    companion object {
        /** One hour of the day is this tall. */
        const val HOUR_HEIGHT = 64f

        /** A block is never drawn shorter, so a title still fits. */
        const val MINIMUM_HEIGHT = 32f

        /** What a touch needs: Material's 48 dp. */
        const val TOUCH_MINIMUM = 48f

        /** The gap under a block, so two one after the other are two. */
        const val GAP = 3f

        private const val MINUTES_PER_HOUR = 60
        private const val MINUTES_PER_HOUR_F = 60f
        private const val HOURS_PER_DAY = 24
        private const val MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR
        private const val SECONDS_PER_MINUTE = 60.0

        /** How tall a block of [minutes] is drawn. */
        fun heightOf(minutes: Int): Float = max(MINIMUM_HEIGHT, minutes / MINUTES_PER_HOUR_F * HOUR_HEIGHT - GAP)

        /** The minutes a block of [minutes] is drawn over. */
        private fun drawnMinutes(minutes: Int): Float = heightOf(minutes) / HOUR_HEIGHT * MINUTES_PER_HOUR_F

        /**
         * The timeline of [day], or `null` for a day without sessions. On today the rows reach the hour of [now], so the line
         * is on them. A session is placed by its start and its real length, so a day the clocks change on keeps its durations.
         */
        fun make(entries: List<Entry>, day: LocalDate, now: Instant, calendar: AgendaCalendar): AgendaTimeline? {
            if (entries.isEmpty()) return null
            val placed = entries.map { entry ->
                val start = calendar.minuteOfDay(entry.startsAt)
                val length =
                    max(1, (Duration.between(entry.startsAt, entry.endsAt).seconds / SECONDS_PER_MINUTE).toInt())
                val end = min(MINUTES_PER_DAY, start + length)
                Placed(entry, start, end, start + ceil(drawnMinutes(end - start)).toInt())
            }.sortedWith(compareBy({ it.start }, { it.end }))

            val isToday = calendar.day(now) == day
            val nowMinute = calendar.minuteOfDay(now)
            var first = placed.minOf { it.start } / MINUTES_PER_HOUR
            var last = min(HOURS_PER_DAY, (placed.maxOf { it.drawnEnd } + MINUTES_PER_HOUR - 1) / MINUTES_PER_HOUR)
            if (isToday) {
                first = min(first, nowMinute / MINUTES_PER_HOUR)
                last = max(last, min(HOURS_PER_DAY, nowMinute / MINUTES_PER_HOUR + 1))
            }
            val origin = first * MINUTES_PER_HOUR
            return AgendaTimeline(
                hours = (first..last).map { "%02d:00".format(it % HOURS_PER_DAY) },
                blocks = columns(placed, origin),
                nowMinutes = if (isToday) nowMinute - origin else null,
                overflowMinutes = max(0, placed.maxOf { it.drawnEnd } - last * MINUTES_PER_HOUR),
            )
        }

        /**
         * Gives every session a column: sessions whose drawn blocks overlap, one after the other (not only two at the same
         * moment), share the width of the day among as many columns as the most of them at once need.
         */
        private fun columns(placed: List<Placed>, origin: Int): List<Block> {
            val blocks = mutableListOf<Block>()
            var group = mutableListOf<Pair<Placed, Int>>()
            var columnEnds = mutableListOf<Int>()
            var groupEnd = 0

            fun flush() {
                val count = columnEnds.size
                blocks += group.map { (placed, column) ->
                    Block(placed.entry.row, placed.start - origin, placed.end - placed.start, column, count)
                }
                group = mutableListOf()
                columnEnds = mutableListOf()
            }

            for (session in placed) {
                if (session.start >= groupEnd) flush()
                val free = columnEnds.indexOfFirst { it <= session.start }
                val column = if (free >= 0) free else columnEnds.size
                if (column ==
                    columnEnds.size
                ) {
                    columnEnds.add(session.drawnEnd)
                } else {
                    columnEnds[column] = session.drawnEnd
                }
                group.add(session to column)
                groupEnd = max(groupEnd, session.drawnEnd)
            }
            flush()
            return blocks
        }
    }
}
