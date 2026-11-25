import FivviAPI

/// The booking link route (F037): the stub's `bookingLinks` answers it.
extension StubAPI {
    func createBookingLink(
        _ input: Operations.CreateBookingLink.Input
    ) async throws -> Operations.CreateBookingLink.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try bookingLinks.create(body)
    }
}
