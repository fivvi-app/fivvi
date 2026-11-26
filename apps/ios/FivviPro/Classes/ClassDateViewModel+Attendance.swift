import Foundation
import FivviStrings

/// TD-03's *Aanwezigheid invullen* (F025): the button that opens CO-05 for this date.
extension ClassDateViewModel {
    /// The button shows on a date that takes place; it is off until someone has a place on it.
    var showsAttendance: Bool { session != nil && !isCancelled }
    var canTakeAttendance: Bool { booked > 0 }
    var attendanceTakeText: String { catalog[.attendanceTake] }

    /// CO-05 of this date, with "Kracht · 18:00–19:00" under its title.
    var attendanceRoute: AttendanceRoute? {
        guard let session else { return nil }
        let zone = TimeZone(identifier: session.timeZone) ?? workspace.timeZone
        let format = SessionFormat(locale: catalog.formattingLocale, timeZone: zone)
        let range = catalog.string(.todayTimeRange, format.time(session.endsAt), format.time(session.startsAt))
        return AttendanceRoute(workspaceID: workspace.id, sessionID: session.id, subtitle: "\(title) · \(range)")
    }
}
