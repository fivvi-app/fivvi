import Foundation
import Observation
import TrainerHubAPI

/// The hello screen: asks the API for the greeting in the interface language and shows it from the catalog.
/// The template for every later screen: one view model, a few states, the generated client's `APIProtocol` as its seam.
@MainActor
@Observable
final class HelloViewModel {
    enum State: Equatable {
        case loading
        case loaded(greeting: String)
        /// The API couldn't be reached, answered with an error, or sent a key the catalog doesn't have.
        case failed
    }

    private(set) var state: State = .loading
    let catalog: Catalog
    private let api: any APIProtocol

    init(api: any APIProtocol, catalog: Catalog) {
        self.api = api
        self.catalog = catalog
    }

    func load() async {
        state = .loading
        do {
            let hello = try await api.getHello(query: .init(locale: catalog.locale)).ok.body.json
            state = catalog.string(forKey: hello.greetingKey).map { .loaded(greeting: $0) } ?? .failed
        } catch {
            state = .failed
        }
    }
}
