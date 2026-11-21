import FivviAPI

/// The personal day route (F013): the stub's `myDay` says what it answers.
extension StubAPI {
    func getMyDay(_ input: Operations.GetMyDay.Input) async throws -> Operations.GetMyDay.Output {
        try myDay.answer(input.query)
    }
}
