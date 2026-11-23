import FivviAPI

/// The personal range route (F013): the stub's `mySessions` says what it answers.
extension StubAPI {
    func listMySessions(
        _ input: Operations.ListMySessions.Input
    ) async throws -> Operations.ListMySessions.Output {
        try mySessions.answer(input.query)
    }
}
