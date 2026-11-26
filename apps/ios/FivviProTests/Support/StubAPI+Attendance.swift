import FivviAPI

/// The attendance routes (F025): the stub's `attendance` says what they answer.
extension StubAPI {
    func listSessionParticipants(
        _ input: Operations.ListSessionParticipants.Input
    ) async throws -> Operations.ListSessionParticipants.Output {
        try attendance.list(input)
    }

    func setParticipantAttendance(
        _ input: Operations.SetParticipantAttendance.Input
    ) async throws -> Operations.SetParticipantAttendance.Output {
        try attendance.set(input)
    }

    func markEveryoneAttended(
        _ input: Operations.MarkEveryoneAttended.Input
    ) async throws -> Operations.MarkEveryoneAttended.Output {
        try attendance.everyone(input)
    }
}
