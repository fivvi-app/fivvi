package app.fivvi.pro.attendance

import app.fivvi.api.models.PersonalSessionClient
import app.fivvi.pro.personal.PersonalRow
import app.fivvi.pro.personal.PersonalRows
import java.time.ZoneId
import java.util.UUID

/** What an ended private session with one client still *Geboekt* shows under its row on Vandaag: the client to mark. */
data class PersonalNudge(
    val clientId: UUID,
    val clientName: String,
    /** The tap waits for the connection (the phone is offline, or the last send did not get through): no buttons until it is sent. */
    val isWaiting: Boolean = false,
    /** The API refused the last tap: the buttons are back, with its reason. */
    val refusal: Reason? = null,
    /** The zone a time in the reason is written in (the workspace's). */
    val zone: ZoneId = PersonalRows.TIME_ZONE,
)

/**
 * What Vandaag and *Hele studio* show about attendance still to fill in (F025, Q18): the nudge under an ended private session
 * whose client is still *Geboekt*, the line alone under an ended class or duo, and the *Te doen* chips of the *Mijn dag* card.
 * The API says which sessions wait (`attendanceOpen`: ended, takes place, a participant still *Geboekt*); this only leaves out
 * what the phone has answered already: a tap waiting in the queue, or the queue's last answer saying nobody is open any more.
 */
class AttendanceNudges(private val queue: QueueState, private val zone: ZoneId = PersonalRows.TIME_ZONE) {
    /** The session waits for attendance, as far as the phone knows. */
    fun isOpen(sessionId: UUID, attendanceOpen: Boolean?): Boolean =
        attendanceOpen == true && !queue.hasPending(sessionId) && queue.settled[sessionId] != 0

    /**
     * The nudge of a private session with one client; a duo and a class have the line alone ([decorate]). A tap that waits
     * for the connection keeps the row, saying so; a tap the API refused brings the buttons back with its reason. A tap that
     * is on its way, with the phone online, takes the nudge away at once.
     */
    fun nudge(
        sessionId: UUID,
        attendanceOpen: Boolean?,
        isPrivate: Boolean,
        clients: List<PersonalSessionClient>?,
    ): PersonalNudge? {
        if (!isPrivate || attendanceOpen != true || queue.settled[sessionId] == 0 || clients?.size != 1) return null
        val client = clients.single()
        val nudge = PersonalNudge(client.clientId, client.name, zone = zone)
        return when {
            queue.hasPending(sessionId) -> if (queue.waitsForConnection) nudge.copy(isWaiting = true) else null

            else -> nudge.copy(
                refusal = queue.rejections(sessionId).lastOrNull { client.clientId in it.clientIds }?.reason,
            )
        }
    }

    /**
     * The row with its nudge, when the private session waits for attendance; a class or a duo that waits has the line
     * *Aanwezigheid nog invullen* alone, which opens CO-05 (TD-02 for a duo).
     */
    fun decorate(
        row: PersonalRow,
        attendanceOpen: Boolean?,
        isPrivate: Boolean,
        clients: List<PersonalSessionClient>?,
    ): PersonalRow {
        nudge(row.id, attendanceOpen, isPrivate, clients)?.let { return row.copy(nudge = it) }
        return if (isOpen(row.id, attendanceOpen)) row.copy(attendanceLine = true) else row
    }
}
