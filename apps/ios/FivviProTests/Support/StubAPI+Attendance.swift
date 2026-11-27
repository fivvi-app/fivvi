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
        await attendance.gate()
        return try attendance.set(input)
    }

    func markEveryoneAttended(
        _ input: Operations.MarkEveryoneAttended.Input
    ) async throws -> Operations.MarkEveryoneAttended.Output {
        await attendance.gate()
        return try attendance.everyone(input)
    }
}
