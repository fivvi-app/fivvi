import Foundation
import FivviStrings

/// What a row says when the API refused a tap on its way (F025, AC9): the same words on TD-02, CO-05 and the nudge of
/// Vandaag.
enum AttendanceMessage {
    static func text(
        for reason: AttendanceQueue.Reason, isClass: Bool, catalog: Catalog, format: SessionFormat
    ) -> String {
        switch reason {
        case .sessionCancelled: catalog[isClass ? .attendanceCancelledClass : .attendanceCancelledSession]
        case .participantCancelled: catalog[.attendanceErrorParticipantCancelled]
        case let .tooEarly(opensAt): catalog.string(.attendanceTooEarly, format.time(opensAt))
        case .other: catalog[.attendanceErrorGeneric]
        }
    }
}
