import Observation
import FivviAPI

/// The signed-in account shown on the home: asks `GET /api/v1/me` through the generated client, which sends the bearer
/// token (`AuthMiddleware`). A `401` is the middleware's business: it signs the app out.
@MainActor
@Observable
final class AccountViewModel {
    enum State: Equatable {
        case loading
        case loaded(email: String)
        /// The API couldn't be reached or didn't answer with the account.
        case failed
    }

    private(set) var state = State.loading
    private let api: any APIProtocol

    init(api: any APIProtocol) {
        self.api = api
    }

    func load() async {
        state = .loading
        do {
            let account = try await api.getMe().ok.body.json
            state = .loaded(email: account.email)
        } catch {
            state = .failed
        }
    }
}
