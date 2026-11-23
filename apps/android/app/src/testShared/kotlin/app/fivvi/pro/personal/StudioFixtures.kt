package app.fivvi.pro.personal

import app.fivvi.api.models.SessionTrainer
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.WorkspaceBusiestMoment
import app.fivvi.api.models.WorkspaceCalendarSession
import app.fivvi.api.models.WorkspaceDay
import app.fivvi.pro.personal.PersonalFixtures.at
import java.util.UUID

/**
 * Synthetic data for the Owner's *Hele studio* (F014): John's Gym on Tuesday 22 September 2026 as
 * `GET /v1/workspaces/{id}/day` answers it for John, the Owner who also trains, with Sarah and Tom as trainers (synthetic
 * IDs; the names are the spec's).
 */
object StudioFixtures {
    const val DAY = PersonalFixtures.DAY

    private fun trainerOf(name: String) = Trainer(UUID.nameUUIDFromBytes("studio:$name".toByteArray()), name)

    val john = trainerOf("John Visser")
    val sarah = trainerOf("Sarah de Boer")
    val tom = trainerOf("Tom Bakker")
    val team = listOf(john, sarah, tom)

    fun idOf(name: String): UUID = UUID.nameUUIDFromBytes("studio-session:$name".toByteArray())

    /** The names of the sessions' IDs, for a test that compares the order of blocks and rows. */
    val names: Map<UUID, String> =
        listOf("mark", "kracht", "lisa", "anna", "boxing", "kracht-late", "yoga", "double").associateBy(::idOf)

    @Suppress("LongParameterList")
    fun session(
        id: String,
        from: String,
        to: String,
        trainer: Trainer? = null,
        client: String? = null,
        className: String? = null,
        cancelled: Boolean = false,
        day: String = DAY,
    ): WorkspaceCalendarSession {
        val isGroup = className != null
        return WorkspaceCalendarSession(
            id = idOf(id),
            type = if (isGroup) WorkspaceCalendarSession.Type.GROUP else WorkspaceCalendarSession.Type.PRIVATE,
            status = if (cancelled) {
                WorkspaceCalendarSession.Status.CANCELLED
            } else {
                WorkspaceCalendarSession.Status.SCHEDULED
            },
            startsAt = at(from, day),
            endsAt = at(to, day),
            timeZone = "Europe/Amsterdam",
            capacity = if (isGroup) 8 else 1,
            version = 1,
            location = PersonalFixtures.place("John's Gym"),
            booked = if (isGroup) 0 else null,
            trainer = trainer?.let { SessionTrainer(it.id, it.name) },
            className = className,
            clientName = client,
        )
    }

    val mark = session("mark", "07:00", "08:00", sarah, client = "Mark Jansen")
    val kracht = session("kracht", "10:00", "11:00", sarah, className = "Kracht")
    val lisa = session("lisa", "11:00", "12:00", tom, client = "Lisa Smit")
    val anna = session("anna", "18:00", "19:00", john, client = "Anna de Vries")
    val boxing = session("boxing", "18:00", "19:00", sarah, className = "Boxing")
    val krachtCancelled = session("kracht-late", "20:00", "21:00", tom, className = "Kracht", cancelled = true)

    /** The busiest moment as the API words it: 18:00–19:00, two at once. */
    val busiest = WorkspaceBusiestMoment(at("18:00"), at("19:00"), "Europe/Amsterdam", 2)

    /** John's day: five sessions of three trainers, two of them at 18:00, and a cancelled class. */
    fun johnsDay(
        items: List<WorkspaceCalendarSession> = listOf(mark, kracht, lisa, anna, boxing, krachtCancelled),
        busiest: WorkspaceBusiestMoment? = StudioFixtures.busiest,
    ) = WorkspaceDay(DAY, "Europe/Amsterdam", items, emptyList(), true, busiest)

    /** A day with no sessions. */
    val emptyDay = WorkspaceDay(DAY, "Europe/Amsterdam", emptyList(), emptyList(), true)
}
