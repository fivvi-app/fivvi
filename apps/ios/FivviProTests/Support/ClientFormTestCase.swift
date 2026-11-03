import FivviAPI
import XCTest

@testable import FivviPro

/// What the tests of the client form share: John's Gym (synthetic), a form on it and an edit form of one of its
/// clients.
@MainActor
class ClientFormTestCase: XCTestCase {
    let language = InterfaceLanguage.resolve(.system())
    func workspace(_ defaultLocale: ClientLocale = .nlNL) -> CurrentWorkspace {
        .init(
            id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", defaultLocale: defaultLocale,
            timeZone: CurrentWorkspace.defaultTimeZone
        )
    }

    func johnsGym() -> StubAPI {
        let api = StubAPI()
        api.clients.seed([
            .init("Anna de Vries", "anna@example.com", .en), .init("Mark Jansen", "mark@example.com", nil)
        ])
        return api
    }

    func form(
        _ api: StubAPI, mode: ClientFormViewModel.Mode = .add, defaultLocale: ClientLocale = .nlNL,
        forbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> ClientFormViewModel {
        ClientFormViewModel(
            api: api, workspace: workspace(defaultLocale), catalog: Catalog(locale: language), mode: mode,
            onForbidden: forbidden
        )
    }

    func editForm(_ api: StubAPI, _ name: String, forbidden: @escaping @MainActor (
        WorkspaceCapabilities.Capability
    ) async -> Void = { _ in }) -> ClientFormViewModel {
        let client = api.clients.all.first { $0.name == name }
        return form(api, mode: .edit(client ?? .init(id: "", name: "", email: "")), forbidden: forbidden)
    }
}
