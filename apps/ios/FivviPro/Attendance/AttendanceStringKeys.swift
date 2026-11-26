import FivviStrings

/// The i18n keys of attendance (F025, packages/i18n/{nl-NL,en}.json): the statuses and messages of the web, and the
/// words only the apps use (`attendance.app.*`).
extension StringKey {
    static let attendanceTitle = StringKey("attendance.title")
    static let attendanceParticipants = StringKey("attendance.participants")
    static let attendanceEveryone = StringKey("attendance.everyone")
    static let attendanceSummary = StringKey("attendance.summary")
    static let attendanceTooEarly = StringKey("attendance.tooEarly")
    static let attendanceCancelledClass = StringKey("attendance.cancelledClass")
    static let attendanceCancelledSession = StringKey("attendance.cancelledSession")
    static let attendanceNudge = StringKey("attendance.nudge")
    static let attendanceNudgeButtonLabel = StringKey("attendance.nudgeButtonLabel")
    static let attendanceErrorGeneric = StringKey("attendance.errors.generic")
    static let attendanceErrorParticipantCancelled = StringKey("attendance.errors.participantCancelled")
    static let attendanceBooked = StringKey("attendance.status.booked")
    static let attendanceAttended = StringKey("attendance.status.attended")
    static let attendanceNoShow = StringKey("attendance.status.noShow")
    static let attendanceCancelledStatus = StringKey("attendance.status.cancelled")

    static let attendanceFrom = StringKey("attendance.app.from")
    static let attendanceCancelledNote = StringKey("attendance.app.cancelled")
    static let attendanceWaiting = StringKey("attendance.app.waiting")
    static let attendanceOpenLabel = StringKey("attendance.app.open")
    static let attendanceRowLabel = StringKey("attendance.app.rowLabel")
    static let attendanceTake = StringKey("attendance.app.take")
    static let attendanceTodo = StringKey("attendance.app.todo")
    static let attendanceCaughtUp = StringKey("attendance.app.caughtUp")
    static let attendanceChip = StringKey("attendance.app.chip")
    static let attendanceSignOutTitle = StringKey("attendance.app.signOutTitle")
    static let attendanceSignOutMessage = StringKey("attendance.app.signOutMessage")
    static let attendanceSignOutConfirm = StringKey("attendance.app.signOutConfirm")
}

extension StringKey {
    static let attendanceGroupLabel = StringKey("attendance.groupLabel")
}

extension StringKey {
    static let attendanceNudgeFor = StringKey("attendance.nudgeFor")
}
