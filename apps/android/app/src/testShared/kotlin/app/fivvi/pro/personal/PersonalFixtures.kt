package app.fivvi.pro.personal

import app.fivvi.api.models.Location
import app.fivvi.api.models.LocationAddress
import app.fivvi.api.models.LocationType
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MyDayFreeGap
import app.fivvi.api.models.MyDayNext
import app.fivvi.api.models.MyDayPlace
import app.fivvi.api.models.MyDaySummary
import app.fivvi.api.models.MyDayTomorrow
import app.fivvi.api.models.PersonalSession
import app.fivvi.api.models.PersonalWorkspace
import app.fivvi.core.me.workspaceIdOf
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID

/**
 * Synthetic data for the personal scope (F013): Sarah's Tuesday 22 September 2026, as `GET /v1/me/day` answers it at 08:35
 * for an account on two teams. The names are the spec's; the IDs are made from them.
 */
object PersonalFixtures {
    const val DAY = "2026-09-22"
    val amsterdam: ZoneId = ZoneId.of("Europe/Amsterdam")
    val sarahPT =
        PersonalWorkspace(
            workspaceIdOf("Sarah Personal Training"),
            "sarah-personal-training",
            "Sarah Personal Training",
        )
    val johns = PersonalWorkspace(workspaceIdOf("John's Gym"), "johns-gym", "John's Gym")

    fun at(time: String, day: String = DAY): OffsetDateTime =
        LocalDate.parse(day).atTime(LocalTime.parse(time)).atZone(amsterdam).toOffsetDateTime()

    /** 08:35 on 22 September. */
    val now: Instant = at("08:35").toInstant()

    fun sessionIdOf(name: String): UUID = UUID.nameUUIDFromBytes("personal:$name".toByteArray())

    fun place(name: String, address: Boolean = true) = Location(
        id = UUID.nameUUIDFromBytes("place:$name".toByteArray()),
        name = name,
        type = LocationType.EXTERNAL_GYM,
        address = if (address) LocationAddress("1011AB", "1", null, "Voorbeeldstraat", "Amsterdam") else null,
        isDefault = true,
    )

    fun session(
        id: String,
        workspace: PersonalWorkspace,
        from: String,
        to: String,
        client: String? = null,
        className: String? = null,
        booked: Int? = null,
        capacity: Int = 1,
        cancelled: Boolean = false,
        place: String? = null,
        day: String = DAY,
        type: PersonalSession.Type? = null,
    ) = PersonalSession(
        sessionId = sessionIdOf(id),
        workspace = workspace,
        type = type ?: if (className == null) PersonalSession.Type.PRIVATE else PersonalSession.Type.GROUP,
        status = if (cancelled) PersonalSession.Status.CANCELLED else PersonalSession.Status.SCHEDULED,
        startsAt = at(from, day),
        endsAt = at(to, day),
        timeZone = "Europe/Amsterdam",
        capacity = capacity,
        booked = booked,
        className = className,
        location = place?.let { place(it) },
        clientName = client,
    )

    val anna = session("anna", sarahPT, "09:00", "10:00", client = "Anna de Vries", place = "TrainMore Zuid")
    val mark = session("mark", johns, "11:00", "12:00", client = "Mark Jansen", place = "John's Gym")
    val kracht = session("kracht", johns, "15:00", "16:00", className = "Kracht", booked = 0, capacity = 8)
    val krachtCancelled = session(
        "kracht-late",
        johns,
        "18:00",
        "19:00",
        className = "Kracht",
        booked = 0,
        capacity = 8,
        cancelled = true,
    )

    /** Sarah's day: four items in two workspaces, Anna next, a free gap and two places ahead. */
    fun sarah(
        items: List<PersonalSession> = listOf(anna, mark, kracht, krachtCancelled),
        workspaceCount: Int = 2,
        done: Int = 0,
        gap: Pair<String, String>? = "12:00" to "13:30",
        places: List<String> = listOf("TrainMore Zuid", "John's Gym"),
        state: MyDayNext.State = MyDayNext.State.UPCOMING,
    ) = MyDay(
        date = DAY,
        timeZone = "Europe/Amsterdam",
        workspaceCount = workspaceCount,
        items = items,
        summary = summaryOf(items, done),
        hasSessions = true,
        next = items.firstOrNull()?.let { MyDayNext(it.sessionId, state, 25) },
        freeGap = gap?.let { MyDayFreeGap(at(it.first), at(it.second)) },
        placesAhead = places.map { MyDayPlace(it) },
        tomorrow = MyDayTomorrow("2026-09-23", 3, at("07:00", "2026-09-23")),
    )

    private fun summaryOf(items: List<PersonalSession>, done: Int) =
        MyDaySummary(items.size, done, items.firstOrNull()?.startsAt, items.lastOrNull()?.endsAt)

    /** A day with no sessions. */
    fun empty(nextSession: String? = null, hasSessions: Boolean = true, tomorrow: Boolean = false) = MyDay(
        date = DAY,
        timeZone = "Europe/Amsterdam",
        workspaceCount = 1,
        items = emptyList(),
        summary = MyDaySummary(0, 0),
        hasSessions = hasSessions,
        tomorrow = if (tomorrow) MyDayTomorrow("2026-09-23", 3, at("07:00", "2026-09-23")) else null,
        // As the API answers: with sessions tomorrow, tomorrow is also the date of the next one.
        nextSessionDate = nextSession ?: if (tomorrow) "2026-09-23" else null,
    )
}
