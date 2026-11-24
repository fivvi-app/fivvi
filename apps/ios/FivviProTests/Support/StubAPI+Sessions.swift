import FivviAPI

/// The session routes (F020): the stub's `sessions` answers them, with the clients of `clients`.
extension StubAPI {
    func listLocations(_ input: Operations.ListLocations.Input) async throws -> Operations.ListLocations.Output {
        try sessions.location()
    }

    func listTrainers(_ input: Operations.ListTrainers.Input) async throws -> Operations.ListTrainers.Output {
        try sessions.trainers()
    }

    func listTeamMembers(_ input: Operations.ListTeamMembers.Input) async throws -> Operations.ListTeamMembers.Output {
        try sessions.team()
    }

    func createPrivateSession(
        _ input: Operations.CreatePrivateSession.Input
    ) async throws -> Operations.CreatePrivateSession.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try sessions.plan(body, clients: clients)
    }

    func getSession(_ input: Operations.GetSession.Input) async throws -> Operations.GetSession.Output {
        try sessions.get(input.path.sessionId)
    }

    func reschedulePrivateSession(
        _ input: Operations.ReschedulePrivateSession.Input
    ) async throws -> Operations.ReschedulePrivateSession.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try sessions.reschedule(input.path.sessionId, body)
    }

    func listClientUpcomingSessions(
        _ input: Operations.ListClientUpcomingSessions.Input
    ) async throws -> Operations.ListClientUpcomingSessions.Output {
        try sessions.upcoming(input.path.clientId)
    }

    func cancelPrivateSession(
        _ input: Operations.CancelPrivateSession.Input
    ) async throws -> Operations.CancelPrivateSession.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try sessions.cancel(input.path.sessionId, body)
    }

    func cancelClassDate(
        _ input: Operations.CancelClassDate.Input
    ) async throws -> Operations.CancelClassDate.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try sessions.cancelClass(input.path.sessionId, body)
    }

    func previewClassCancellation(
        _ input: Operations.PreviewClassCancellation.Input
    ) async throws -> Operations.PreviewClassCancellation.Output {
        try sessions.preview(input.path.sessionId)
    }
}
