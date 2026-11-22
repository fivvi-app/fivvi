import FivviAPI

/// The workspace day route (F014): the stub's `workspaceDay` says what it answers.
extension StubAPI {
    func getWorkspaceDay(_ input: Operations.GetWorkspaceDay.Input) async throws -> Operations.GetWorkspaceDay.Output {
        try workspaceDay.answer(input)
    }
}
