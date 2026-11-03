import FivviAPI
import XCTest

@testable import FivviPro

/// *Klantprofiel* / *Client profile* (TM-03, F006 AC7 and AC12): the overview of one client. The test plan runs every
/// test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClientProfileViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private let workspace = CurrentWorkspace(
        id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", defaultLocale: .nlNL,
        timeZone: TimeZone(identifier: "Europe/Amsterdam") ?? .current
    )

    private func johnsGym() -> StubAPI {
        let api = StubAPI()
        api.clients.seed([
            .init("Anna de Vries", "anna@example.com", .en), .init("Mark Jansen", "mark@example.com", nil)
        ])
        return api
    }

    private func profile(
        _ api: StubAPI, id: String?, onChange: @escaping @MainActor (Components.Schemas.Client) -> Void = { _ in }
    ) -> ClientProfileViewModel {
        ClientProfileViewModel(
            api: api, workspace: workspace, clientID: id ?? "", catalog: Catalog(locale: language), onChange: onChange
        )
    }

    func test_F006_AC12_theOverviewShowsTheNameTheEmailAddressAndTheLanguage() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = johnsGym()
        let catalog = TestCatalog(language)
        let anna = profile(api, id: api.clients.id(of: "Anna de Vries"))
        XCTAssertEqual(anna.state, .loading)

        await anna.load()

        XCTAssertEqual(anna.state, .loaded)
        XCTAssertEqual(anna.title, "Anna de Vries")
        XCTAssertEqual(anna.emailText, "anna@example.com")
        XCTAssertEqual(anna.localeText, catalog["clients.addDialog.localeEn"], "English: chosen by the team")

        let mark = profile(api, id: api.clients.id(of: "Mark Jansen"))
        await mark.load()
        XCTAssertEqual(mark.emailText, "mark@example.com", "every client has an address")
        XCTAssertEqual(
            mark.localeText,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"]),
            "Standaard (Nederlands) until someone sets one"
        )
    }

    func test_F006_AC12_aReadThatTakesTenSecondsSaysSoUntilTheClientIsThere() async {
        let clock = ManualClock()
        let api = johnsGym()
        let anna = ClientProfileViewModel(
            api: api, workspace: workspace, clientID: api.clients.id(of: "Anna de Vries") ?? "",
            catalog: Catalog(locale: language), clock: clock
        )
        XCTAssertFalse(anna.loadingSlow)

        let watching = Task { await anna.watchSlowLoading() }
        await clock.untilSleeping()
        clock.advance(by: .seconds(9))
        XCTAssertFalse(anna.loadingSlow, "not yet")
        clock.advance(by: .seconds(1))
        await watching.value
        XCTAssertTrue(anna.loadingSlow, "after 10 seconds")

        await anna.load()
        await anna.watchSlowLoading()
        XCTAssertFalse(anna.loadingSlow, "the client is there")
    }

    func test_F006_AC12_aClientAtHandShowsAtOnceAndAClientJustAddedSaysSo() {
        let api = johnsGym()
        let client = api.clients.all[1]
        let model = ClientProfileViewModel(
            api: api, workspace: workspace, client: client, catalog: Catalog(locale: language), justAdded: true
        )

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.title, "Mark Jansen")
        XCTAssertEqual(model.addedText, String(format: TestCatalog(language)["clients.profile.added"], "Mark Jansen"))
    }

    func test_F006_AC7_theChangeShowsOnTheNextLoad() async throws {
        let api = johnsGym()
        let id = try XCTUnwrap(api.clients.id(of: "Anna de Vries"))
        var changed: [Components.Schemas.Client] = []
        let model = profile(api, id: id, onChange: { changed.append($0) })
        await model.load()
        let form = try XCTUnwrap(model.editForm())
        form.name = "Anna Visser"
        form.email = "anna.visser@example.com"

        let savedResult = await form.submit()

        let saved = try XCTUnwrap(savedResult)
        model.didSave(saved)

        XCTAssertEqual(model.title, "Anna Visser")
        XCTAssertEqual(model.emailText, "anna.visser@example.com")
        XCTAssertEqual(model.savedText, TestCatalog(language)["clients.profile.saved"])
        XCTAssertEqual(changed.last?.name, "Anna Visser", "the list row follows")
        // Another device reads the same.
        let other = profile(api, id: id)
        await other.load()
        XCTAssertEqual(other.title, "Anna Visser")
        XCTAssertEqual(other.client?.email, "anna.visser@example.com")
    }

    func test_F006_AC12_aFailedReadShowsTheErrorAndLoadingAgainRecovers() async {
        let api = johnsGym()
        let model = profile(api, id: api.clients.id(of: "Anna de Vries"))
        api.clients.fail(.get, with: .offline)

        await model.load()
        XCTAssertEqual(model.state, .failed)

        api.clients.fail(.get, with: nil)
        await model.load()
        XCTAssertEqual(model.state, .loaded)

        api.clients.fail(.get, with: .status(500))
        await model.refresh()
        XCTAssertEqual(model.state, .loaded, "what was shown stays")
        XCTAssertEqual(model.title, "Anna de Vries")
    }

    func test_F006_AC10_aClientOutsideTheWorkspaceOrWithoutAccessShowsTheNoPermissionState() async {
        let api = johnsGym()
        var forbidden: [WorkspaceCapabilities.Capability] = []
        let model = ClientProfileViewModel(
            api: api, workspace: workspace, clientID: "unknown", catalog: Catalog(locale: language),
            onForbidden: { forbidden.append($0) }
        )

        await model.load()
        XCTAssertEqual(model.state, .noPermission, "404 for a client that is not there")
        XCTAssertTrue(forbidden.isEmpty)

        api.clients.fail(.get, with: .forbidden)
        await model.load()
        XCTAssertEqual(model.state, .noPermission)
        XCTAssertEqual(forbidden, [.clients_view])
    }

    func test_F006_AC12_theLabelsComeFromTheCatalog() {
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)

        XCTAssertEqual(catalog[.clientProfileTitle], expected["clients.profile.title"])
        XCTAssertEqual(catalog[.clientProfileOverview], expected["clients.profile.overview"])
        XCTAssertEqual(catalog[.clientProfileNameLabel], expected["clients.profile.nameLabel"])
        XCTAssertEqual(catalog[.clientProfileEmailLabel], expected["clients.profile.emailLabel"])
        XCTAssertEqual(catalog[.clientProfileLocaleLabel], expected["clients.profile.localeLabel"])
        XCTAssertEqual(catalog[.clientProfileEdit], expected["clients.profile.edit"])
        XCTAssertEqual(catalog[.clientProfileSave], expected["clients.profile.save"])
        XCTAssertEqual(catalog[.clientsSubmit], expected["clients.addDialog.submit"])
        XCTAssertEqual(catalog[.clientsCancel], expected["clients.addDialog.cancel"])
        XCTAssertEqual(catalog[.clientsOtherEmail], expected["clients.addDialog.otherEmail"])
    }

    func test_F006_AC12_listSearchAddEdit() async throws {
        let api = johnsGym()
        let list = ClientsViewModel(api: api, workspace: workspace, catalog: Catalog(locale: language))
        await list.load()
        XCTAssertEqual(list.clients.map(\.name), ["Anna de Vries", "Mark Jansen"])

        await list.search("vrie")
        XCTAssertEqual(list.clients.map(\.name), ["Anna de Vries"])
        await list.search("")

        let form = list.newClientForm()
        form.name = "Eva Smit"
        form.email = "eva@example.com"
        form.locale = .nlNL
        let addedResult = await form.submit()
        let added = try XCTUnwrap(addedResult)
        list.didAdd(added)
        XCTAssertEqual(list.clients.map(\.name), ["Anna de Vries", "Eva Smit", "Mark Jansen"])

        let profile = list.profile(of: added, justAdded: true)
        XCTAssertNotNil(profile.addedText)
        await profile.refresh()
        let edit = try XCTUnwrap(profile.editForm())
        edit.name = "Eva Smits"
        let editedResult = await edit.submit()
        let edited = try XCTUnwrap(editedResult)
        profile.didSave(edited)

        XCTAssertEqual(list.clients.map(\.name), ["Anna de Vries", "Eva Smits", "Mark Jansen"])
        await list.refresh()
        XCTAssertEqual(list.clients.map(\.name), ["Anna de Vries", "Eva Smits", "Mark Jansen"], "the API has it too")
    }
}
