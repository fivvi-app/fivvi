package app.fivvi.pro.personal

import app.fivvi.api.models.MyDayNext
import app.fivvi.api.models.WorkspaceCalendarSession
import app.fivvi.api.models.WorkspaceDay
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.SessionRoute
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.UUID

/** The busiest moment of the day as written: *Drukst 18:00–19:00 · 2 tegelijk* (the API decides it, this words its times). */
data class StudioBusiest(val from: String, val to: String, val count: Int)

/** A mark on the time axis: the hour (`07`) and where it sits, 0 to 1. */
data class StudioTick(val label: String, val fraction: Double)

/** A session as a block of a trainer's lane: [left] and [width] are shares of the axis (0 to 1). */
data class StudioBlock(
    /** The session as a row: the block opens TD-02 or TD-03 by it. */
    val row: PersonalRow,
    val left: Double,
    val width: Double,
    /** The row of the lane the block sits in: sessions at the same time sit under each other. */
    val stack: Int,
    val isGroup: Boolean,
    val isPast: Boolean,
    /** The trainer's whole name, for the block's accessible name; `null` for a session with no trainer. */
    val trainerName: String?,
)

/** One trainer's day: [isOwn] is the signed-in Owner (*Jij*), [trainerName] is `null` for the lane of sessions with no trainer. */
data class StudioLane(
    val id: String,
    val trainerName: String?,
    val isOwn: Boolean,
    val blocks: List<StudioBlock>,
    /** The rows the sessions at the same time need. */
    val rowCount: Int,
) {
    /** A trainer's first name, the label of the lane (the Owner's is *Jij*, worded by the screen). */
    val firstName: String? get() = trainerName?.trim()?.substringBefore(' ')
}

/** *Hele studio*'s lanes along one time axis, a mark every three hours, and the now-line while now is on the axis. */
data class StudioTimeline(val ticks: List<StudioTick>, val lanes: List<StudioLane>, val nowFraction: Double?) {
    /** Lanes of a trainer: the lane of nobody is not one. */
    val trainerCount: Int get() = lanes.count { it.trainerName != null }
}

/**
 * The head of the team card and what is under it. [timeline] is `null` for a day with no sessions (*Geen sessies vandaag*);
 * [busiest] is `null` when no two sessions overlap (*Geen overlap*).
 */
data class StudioTeam(val trainers: Int, val busiest: StudioBusiest?, val timeline: StudioTimeline?)

/**
 * The Owner's *Hele studio* of TD-01 (F014, the design of `DECISIONS.md` §3) from `GET /v1/workspaces/{id}/day`: the team
 * card with a lane per trainer, the next card and the day's rows, each with its trainer. The API decides the day and the
 * busiest moment; only what is drawn is decided here (where a block sits, which row of its lane it takes). Open Gym is
 * left out (spec #457), and a cancelled session is no block and no next one, but stays a row, struck through.
 *
 * Times are written in the day's own time zone, as the API sent it. [ownId] is the signed-in person's team-member ID in the
 * workspace: the trainer whose ID it is, is *jij*.
 */
class StudioContent(
    private val day: WorkspaceDay,
    private val workspaceId: UUID,
    private val workspaceName: String,
    private val ownId: UUID?,
    private val now: Instant,
    private val locale: Locale,
) {
    private val zone: ZoneId = runCatching { ZoneId.of(day.timeZone) }.getOrDefault(PersonalRows.TIME_ZONE)
    private val format = SessionFormat(locale, zone)
    private val items = day.items.filter { it.type != WorkspaceCalendarSession.Type.OPEN_GYM }

    /** The sessions that take place: the lanes and the next card leave a cancelled one out. */
    private val taking = items.filter { it.status == WorkspaceCalendarSession.Status.SCHEDULED }
    private val namesKinds = items.map { it.type }.toSet().size > 1

    private fun trainerOf(item: WorkspaceCalendarSession): PersonalTrainer {
        val trainer = item.trainer ?: return PersonalTrainer.Nobody
        return if (trainer.id == ownId) PersonalTrainer.You else PersonalTrainer.Named(trainer.name)
    }

    private fun row(item: WorkspaceCalendarSession): PersonalRow {
        val isGroup = item.type == WorkspaceCalendarSession.Type.GROUP
        return PersonalRow(
            id = item.id,
            workspaceId = workspaceId,
            workspaceName = workspaceName,
            isGroup = isGroup,
            title = (if (isGroup) item.className else item.clientName).orEmpty(),
            startText = format.time(item.startsAt),
            endText = format.time(item.endsAt),
            namesKind = namesKinds,
            showsWorkspace = false,
            location = item.location.name.takeIf { !isGroup },
            routeUrl = if (isGroup) null else SessionRoute.url(item.location.address),
            pill = if (isGroup) {
                item.booked?.let {
                    if (it >= item.capacity) PersonalPill.Full else PersonalPill.Booked(it, item.capacity)
                }
            } else {
                null
            },
            isCancelled = item.status == WorkspaceCalendarSession.Status.CANCELLED,
            isPast = !item.endsAt.toInstant().isAfter(now),
            trainer = trainerOf(item),
        )
    }

    /** The Owner's lane first, then the trainers by name, and the lane of nobody last. */
    private val laneOrder = compareBy<StudioLane>(
        {
            if (it.isOwn) {
                0
            } else if (it.trainerName == null) {
                2
            } else {
                1
            }
        },
        { it.trainerName?.lowercase(locale).orEmpty() },
    )

    /** The team card: its head, the busiest moment and the lanes. */
    val team: StudioTeam = timeline()?.let { timeline ->
        StudioTeam(
            trainers = timeline.trainerCount,
            busiest = day.busiest?.let {
                val written = SessionFormat(locale, runCatching { ZoneId.of(it.timeZone) }.getOrDefault(zone))
                StudioBusiest(written.time(it.startsAt), written.time(it.endsAt), it.atOnce)
            },
            timeline = timeline,
        )
    } ?: StudioTeam(0, null, null)

    /** The first session that has not ended, as the web's *Nog vandaag* has it (a cancelled one is none). */
    val next: PersonalNext? = taking.firstOrNull { it.endsAt.toInstant().isAfter(now) }?.let {
        PersonalNext(row(it), it.startsAt.toInstant(), MyDayNext.State.UPCOMING)
    }

    /** Every other session of the day in time order, with its trainer; the next one is not repeated. */
    val rows: List<PersonalRow> = items.filter { it.id != next?.row?.id }.map(::row)

    /** A session on the axis: its start and end as minutes of the day. */
    private class Placed(val item: WorkspaceCalendarSession, val start: Int, val end: Int) {
        val key: String get() = item.trainer?.id?.toString() ?: NOBODY
    }

    private fun minutesOfDay(at: Instant): Int = at.atZone(zone).let { it.hour * MINUTES_PER_HOUR + it.minute }

    private fun timeline(): StudioTimeline? {
        if (taking.isEmpty()) return null
        // A session is placed by its start and its length, so a day with the clocks changing keeps real durations.
        val placed = taking.map {
            val start = minutesOfDay(it.startsAt.toInstant())
            val length = maxOf(1L, Duration.between(it.startsAt, it.endsAt).toMillis() / MILLIS_PER_MINUTE).toInt()
            Placed(it, start, minOf(MINUTES_PER_DAY, start + length))
        }
        val firstHour = placed.minOf { it.start } / MINUTES_PER_HOUR
        val lastHour = (placed.maxOf { it.end } + MINUTES_PER_HOUR - 1) / MINUTES_PER_HOUR
        val endHour = minOf(HOURS_PER_DAY, maxOf(firstHour + MIN_AXIS_HOURS, lastHour))
        val range = ((endHour - firstHour) * MINUTES_PER_HOUR).toDouble()
        val share = { minute: Int -> (minute - firstHour * MINUTES_PER_HOUR) / range }

        val ticks = (firstHour..endHour step TICK_EVERY_HOURS).map {
            StudioTick("%02d".format(Locale.ROOT, it), (it - firstHour).toDouble() / (endHour - firstHour))
        }
        val lanes = placed.groupBy { it.key }.map { (key, entries) -> lane(key, entries, share) }.sortedWith(laneOrder)
        val nowShare = share(minutesOfDay(now))
        val sameDay = now.atZone(zone).toLocalDate() == taking[0].startsAt.atZoneSameInstant(zone).toLocalDate()
        return StudioTimeline(ticks, lanes, nowShare.takeIf { sameDay && it in 0.0..1.0 })
    }

    private fun lane(key: String, entries: List<Placed>, share: (Int) -> Double): StudioLane {
        val trainer = entries.first().item.trainer
        val stacks = mutableListOf<MutableList<IntRange>>()
        val blocks = entries.map { entry ->
            val span = entry.start until entry.end
            var stack = 0
            while (stack < stacks.size && stacks[stack].any { it.overlaps(span) }) stack++
            if (stack == stacks.size) stacks += mutableListOf<IntRange>()
            stacks[stack] += span
            val row = row(entry.item)
            StudioBlock(
                row = row,
                left = share(entry.start),
                width = share(entry.end) - share(entry.start),
                stack = stack,
                isGroup = row.isGroup,
                isPast = row.isPast,
                trainerName = trainer?.name,
            )
        }
        return StudioLane(key, trainer?.name, trainer != null && trainer.id == ownId, blocks, maxOf(1, stacks.size))
    }

    private fun IntRange.overlaps(other: IntRange) = first <= other.last && other.first <= last

    private companion object {
        const val NOBODY = "none"
        const val MINUTES_PER_HOUR = 60
        const val HOURS_PER_DAY = 24
        const val MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR
        const val MILLIS_PER_MINUTE = 60_000L
        const val MIN_AXIS_HOURS = 9
        const val TICK_EVERY_HOURS = 3
    }
}
