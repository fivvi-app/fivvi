import Foundation
import FivviAPI
import FivviStrings

/// What Vandaag and *Hele studio* show about attendance still to fill in (F025, Q18): the nudge under an ended private
/// session whose client is still *Geboekt*, the line alone under an ended class or duo, and the *Te doen* chips of the
/// *Mijn dag* card. The API says which sessions wait (`attendanceOpen`: ended, takes place, a participant still
/// *Geboekt*); this only leaves out what the phone has already answered: a tap waiting in the queue, or the queue's last
/// answer saying nobody is open any more (`settled`).
@MainActor
struct AttendanceNudges {
    let queue: AttendanceQueue
    let catalog: Catalog
    /// The workspace's, for the time a refusal names.
    var timeZone = PersonalRows.timeZone

    /// The session waits for attendance, as far as the phone knows.
    func isOpen(sessionID: String, attendanceOpen: Bool?) -> Bool {
        guard attendanceOpen == true, !queue.hasPending(sessionID: sessionID) else { return false }
        return queue.settled[sessionID] != 0
    }

    /// The nudge of a private session with one client; a duo and a class have the line alone (`decorate`).
    /// A tap that waits for the connection keeps the row, saying so; a tap the API refused brings the buttons back with
    /// its message. A tap that is on its way, with the phone online, takes the nudge away at once.
    func nudge(
        sessionID: String, attendanceOpen: Bool?, isPrivate: Bool, clients: [Components.Schemas.PersonalSessionClient]?
    ) -> PersonalRow.Nudge? {
        guard isPrivate, attendanceOpen == true, queue.settled[sessionID] != 0, clients?.count == 1,
              let client = clients?.first
        else { return nil }
        var nudge = PersonalRow.Nudge(clientID: client.clientId, clientName: client.name)
        if queue.hasPending(sessionID: sessionID) {
            guard queue.waitsForConnection else { return nil }
            nudge.isWaiting = true
            nudge.waitingText = catalog[.attendanceWaiting]
        } else if let refused = queue.rejections(sessionID: sessionID).last(
            where: { $0.clientIDs.contains(client.clientId) }
        ) {
            nudge.message = AttendanceMessage.text(
                for: refused.reason, isClass: false, catalog: catalog,
                format: SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone)
            )
        }
        return nudge
    }

    /// The row as VoiceOver reads it: *Aanwezigheid nog invullen: Anna*, and *Wacht op verbinding* or the refusal after it.
    func spoken(_ row: String, _ nudge: PersonalRow.Nudge) -> String {
        let nudged = catalog.string(.todaySpokenJoin, row, catalog.string(.attendanceNudgeFor, nudge.clientName))
        guard let extra = nudge.waitingText ?? nudge.message else { return nudged }
        return catalog.string(.todaySpokenJoin, nudged, extra)
    }

    /// The row with its nudge, when the private session waits for attendance; a class or a duo that waits has the line
    /// *Aanwezigheid nog invullen* alone, which opens CO-05 (TD-02).
    func decorate(
        _ row: PersonalRow, sessionID: String, attendanceOpen: Bool?, isPrivate: Bool,
        clients: [Components.Schemas.PersonalSessionClient]?
    ) -> PersonalRow {
        var row = row
        if let nudge = nudge(
            sessionID: sessionID, attendanceOpen: attendanceOpen, isPrivate: isPrivate, clients: clients
        ) {
            row.nudge = nudge
            row.spokenLabel = spoken(row.spokenLabel, nudge)
        } else if isOpen(sessionID: sessionID, attendanceOpen: attendanceOpen) {
            row.attendanceLine = true
            row.spokenLabel = catalog.string(.todaySpokenJoin, row.spokenLabel, catalog[.attendanceNudge])
        }
        return row
    }

    /// A tap on *Aanwezig* or *Niet verschenen* of a nudge: queued like every other tap.
    func mark(_ status: AttendanceStatus, row: PersonalRow) {
        guard let nudge = row.nudge, let payload = status.request else { return }
        queue.enqueue(
            workspaceID: row.workspaceID, sessionID: row.id, .set(clientID: nudge.clientID, status: payload)
        )
    }
}
