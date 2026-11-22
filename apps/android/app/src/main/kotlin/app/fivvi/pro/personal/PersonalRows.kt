package app.fivvi.pro.personal

import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MyDayNext
import app.fivvi.api.models.PersonalSession
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.SessionRoute
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlin.math.ceil

/** The booked figure of a class row: *3/8*, or *Vol* once no place is left. */
sealed interface PersonalPill {
    data class Booked(val booked: Int, val capacity: Int) : PersonalPill

    data object Full : PersonalPill
}

/**
 * A line of Vandaag (TD-01), and later of Agenda (TD-04): one item of the personal scope, written down in Dutch time. Nothing
 * here decides anything: what the API sent is kept, and what only fits when the person has more than one kind or team
 * ([namesKind], [showsWorkspace]) is switched on only then (F013 AC2, the design of `DECISIONS.md` §3). The texts around
 * these come from the string catalog on screen.
 */
data class PersonalRow(
    val id: UUID,
    val workspaceId: UUID,
    val workspaceName: String,
    val isGroup: Boolean,
    val title: String,
    /** *09:00* */
    val startText: String,
    val endText: String,
    /** The row says *Privésessie* or *Groepsles*: the person's items are of more than one kind. */
    val namesKind: Boolean,
    /** The row says its workspace, with the colour dot: the person is on more than one team. */
    val showsWorkspace: Boolean,
    /** The place of a private session; a class says none. */
    val location: String?,
    /** The maps app's address of [location], when the API has one. */
    val routeUrl: String?,
    val pill: PersonalPill?,
    val isCancelled: Boolean,
    val isPast: Boolean,
)

/** Builds the rows of a list of items, in the language's formatting locale and Dutch time. */
class PersonalRows(
    items: List<PersonalSession>,
    private val workspaceCount: Int,
    private val now: Instant,
    private val format: SessionFormat,
) {
    /** The items are of more than one kind, so each row names its kind. */
    private val namesKinds = items.map { it.type }.toSet().size > 1

    fun row(item: PersonalSession): PersonalRow {
        val isGroup = item.type == PersonalSession.Type.GROUP
        val place = item.location
        return PersonalRow(
            id = item.sessionId,
            workspaceId = item.workspace.id,
            workspaceName = item.workspace.name,
            isGroup = isGroup,
            title = (if (isGroup) item.className else item.clientName).orEmpty(),
            startText = format.time(item.startsAt),
            endText = format.time(item.endsAt),
            namesKind = namesKinds,
            showsWorkspace = workspaceCount > 1,
            location = place?.name.takeIf { !isGroup },
            routeUrl = if (isGroup) null else SessionRoute.url(place?.address),
            pill = if (isGroup) {
                item.booked?.let {
                    if (it >=
                        item.capacity
                    ) {
                        PersonalPill.Full
                    } else {
                        PersonalPill.Booked(it, item.capacity)
                    }
                }
            } else {
                null
            },
            isCancelled = item.status == PersonalSession.Status.CANCELLED,
            isPast = !item.endsAt.toInstant().isAfter(now),
        )
    }

    companion object {
        /** Everything the personal scope shows is in Dutch time (F013 AC14). */
        val TIME_ZONE: ZoneId = ZoneId.of("Europe/Amsterdam")
    }
}

/** *Vrij 11:00–15:00* and *4 uur*, with the start *Plannen* hands PS-04. */
data class PersonalFreeGap(val from: String, val to: String, val hours: String, val start: OffsetDateTime)

/** The *Mijn dag* card: only what the list doesn't tell. *Te doen* of F025 will join it as its first row. */
data class PersonalCard(
    /** `null` when no gap is left: the card says so. */
    val gap: PersonalFreeGap?,
    /** *Studio Fit → Park*, only with two places or more. */
    val route: String?,
)

/** What an empty day says. */
sealed interface PersonalEmpty {
    /** *Geen sessies vandaag. Je volgende sessie is op …* with the date of the next one. */
    data class NextSession(val date: String) : PersonalEmpty

    data object Today : PersonalEmpty

    /** The person has no sessions at all. */
    data object Never : PersonalEmpty
}

data class PersonalSummary(val count: Int, val done: Int, val first: String, val last: String)

data class PersonalTomorrow(val count: Int, val first: String, val date: String)

/** The gradient card: the item the API names as next. */
data class PersonalNext(val row: PersonalRow, private val startsAt: Instant, private val state: MyDayNext.State) {
    /** The minutes until it starts, counted from the server's instants as time passes; `null` while it is in progress. */
    fun minutesAt(at: Instant): Int? {
        if (state == MyDayNext.State.IN_PROGRESS || !startsAt.isAfter(at)) return null
        return ceil(Duration.between(at, startsAt).toMillis() / MILLIS_PER_MINUTE).toInt()
    }

    private companion object {
        const val MILLIS_PER_MINUTE = 60_000.0
    }
}

/**
 * TD-01 *Vandaag* (F013, the design of `DECISIONS.md` §3) from `GET /v1/me/day`: the server decides the summary, *Straks*, the
 * free gap and the places ahead; this writes them down. Open Gym is left out (spec #457: nothing about it in the UI).
 */
class TodayContent(private val day: MyDay, now: Instant, private val format: SessionFormat) {
    private val items = day.items.filter { it.type != PersonalSession.Type.OPEN_GYM }
    private val builder = PersonalRows(items, day.workspaceCount, now, format)

    /** *4 sessies · 09:00–19:00 · 1 klaar*, or `null` for *Geen sessies vandaag*. */
    val summary: PersonalSummary? = run {
        val first = day.summary.firstStartsAt
        val last = day.summary.lastEndsAt
        if (day.summary.count > 0 && first != null && last != null) {
            PersonalSummary(day.summary.count, day.summary.done, format.time(first), format.time(last))
        } else {
            null
        }
    }

    val card: PersonalCard? = if (items.isEmpty()) {
        null
    } else {
        val places = day.placesAhead.orEmpty().map { it.name }
        PersonalCard(
            gap = day.freeGap?.let {
                val hours = Duration.between(it.startsAt, it.endsAt).toMinutes() / MINUTES_PER_HOUR
                PersonalFreeGap(
                    format.time(it.startsAt),
                    format.time(it.endsAt),
                    hours(hours, format.locale),
                    it.startsAt,
                )
            },
            route = places.takeIf { it.size >= 2 }?.joinToString(" → "),
        )
    }

    val next: PersonalNext? = day.next?.let { next ->
        items.firstOrNull { it.sessionId == next.sessionId }
            ?.let { PersonalNext(builder.row(it), it.startsAt.toInstant(), next.state) }
    }

    /** Every other item of today in time order; the next one is not repeated. */
    val rows: List<PersonalRow> = items.filter { it.sessionId != day.next?.sessionId }.map(builder::row)

    /** The empty day's text; the API also sends `nextSessionDate` when tomorrow has sessions: the *Morgen* line says it then. */
    val empty: PersonalEmpty? = if (items.isNotEmpty()) {
        null
    } else {
        val next = day.nextSessionDate
        when {
            day.tomorrow == null && next != null -> PersonalEmpty.NextSession(format.day(LocalDate.parse(next)))
            day.hasSessions -> PersonalEmpty.Today
            else -> PersonalEmpty.Never
        }
    }

    /** *Morgen: 3 sessies, eerste om 07:00*, which opens Agenda on its date. */
    val tomorrow: PersonalTomorrow? = day.tomorrow?.takeIf { it.count > 0 }
        ?.let { PersonalTomorrow(it.count, format.time(it.firstStartsAt), it.date) }

    companion object {
        private const val MINUTES_PER_HOUR = 60.0

        /** *1,5*, *2*: hours with at most one decimal. */
        fun hours(hours: Double, locale: Locale): String = NumberFormat.getNumberInstance(locale).apply {
            maximumFractionDigits = 1
            minimumFractionDigits = 0
        }.format(hours)

        /** *dinsdag 22 september*, the date above the title. */
        fun eyebrow(now: Instant, locale: Locale): String =
            DateTimeFormatter.ofPattern("EEEE d MMMM", locale).format(now.atZone(PersonalRows.TIME_ZONE))

        /** *Tijden in Nederlandse tijd* shows when the phone is on another clock than Amsterdam's (F013 AC14). */
        fun showsTimeZoneHint(device: ZoneId, now: Instant): Boolean =
            device.rules.getOffset(now) != PersonalRows.TIME_ZONE.rules.getOffset(now)
    }
}
