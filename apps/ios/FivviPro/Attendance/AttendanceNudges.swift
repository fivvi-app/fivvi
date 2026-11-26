import Foundation
import FivviAPI
import FivviStrings

/// What Vandaag and *Hele studio* show about attendance still to fill in (F025, Q18): the nudge under an ended private
/// session whose client is still *Geboekt*, and the *Te doen* chips of the *Mijn dag* card. The API says which sessions
/// wait (`attendanceOpen`: ended, takes place, a participant still *Geboekt*); this only leaves out what the phone has
/// already answered: a tap waiting in the queue, or the queue's last answer saying nobody is open any more (`settled`).
@MainActor
struct AttendanceNudges {
    let queue: AttendanceQueue
    let catalog: Catalog

    /// The session waits for attendance, as far as the phone knows.
    func isOpen(sessionID: String, attendanceOpen: Bool?) -> Bool {
        guard attendanceOpen == true, !queue.hasPending(sessionID: sessionID) else { return false }
        return queue.settled[sessionID] != 0
    }

    /// The nudge of a private session with one client; a duo, a class and Open Gym have none (their chip opens the screen).
    func nudge(
        sessionID: String, attendanceOpen: Bool?, isPrivate: Bool, clients: [Components.Schemas.PersonalSessionClient]?
    ) -> PersonalRow.Nudge? {
        guard isPrivate, isOpen(sessionID: sessionID, attendanceOpen: attendanceOpen), clients?.count == 1,
              let client = clients?.first
        else { return nil }
        return PersonalRow.Nudge(clientID: client.clientId, clientName: client.name)
    }

    /// *Aanwezigheid nog invullen* with the nudge's name, as VoiceOver reads it after the row.
    func spoken(_ nudge: PersonalRow.Nudge) -> String {
        catalog.string(.attendanceNudgeFor, nudge.clientName)
    }

    /// A tap on *Aanwezig* or *Niet verschenen* of a nudge: queued like every other tap.
    func mark(_ status: AttendanceStatus, row: PersonalRow) {
        guard let nudge = row.nudge, let payload = status.request else { return }
        queue.enqueue(
            workspaceID: row.workspaceID, sessionID: row.id, .set(clientID: nudge.clientID, status: payload)
        )
    }
}
