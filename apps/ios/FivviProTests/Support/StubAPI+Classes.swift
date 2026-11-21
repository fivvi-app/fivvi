import FivviAPI

/// The group class routes (F021): the stub's `classes` answers them over the sessions of `sessions`.
extension StubAPI {
    func createGroupClass(
        _ input: Operations.CreateGroupClass.Input
    ) async throws -> Operations.CreateGroupClass.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try classes.create(body, sessions: sessions)
    }

    func getGroupClass(_ input: Operations.GetGroupClass.Input) async throws -> Operations.GetGroupClass.Output {
        try classes.get(input.path.classId)
    }
}
