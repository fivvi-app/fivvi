import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Klanten* / *Clients* (TM-02, F006 AC6 and AC12): the workspace's clients from `GET /workspaces/{id}/clients`
/// through the generated client, searched on the server, in pages, kept on screen when a refresh fails. The test plan
/// runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClientsViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private let workspace = CurrentWorkspace(
        id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", defaultLocale: .nlNL,
        timeZone: TimeZone(identifier: "Europe/Amsterdam") ?? .current
    )

    /// John's Gym (synthetic): every client has an email address.
    private func johnsGym() -> StubAPI {
        let api = StubAPI()
        api.clients.seed([
            .init("Sophie Bakker", "sophie.bakker@example.com", nil),
            .init("Mark Jansen", "mark@example.com", nil),
            .init("Anna de Vries", "anna@example.com", .en)
        ])
        return api
    }

    private func model(
        _ api: StubAPI, pageSize: Int = 50, now: @escaping () -> Date = Date.init,
        in workspace: CurrentWorkspace? = nil, clock: any Clock<Duration> = ContinuousClock(),
        forbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> ClientsViewModel {
        ClientsViewModel(
            api: api, workspace: workspace ?? self.workspace, catalog: Catalog(locale: language), pageSize: pageSize,
            now: now, clock: clock, onForbidden: forbidden
        )
    }

    func test_F006_AC6_theListShowsEveryClientSortedByName() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = johnsGym()
        let model = model(api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.clients.map(\.name), ["Anna de Vries", "Mark Jansen", "Sophie Bakker"])
        XCTAssertEqual(
            model.clients.map(\.email), ["anna@example.com", "mark@example.com", "sophie.bakker@example.com"]
        )
        XCTAssertEqual(model.total, 3)
        XCTAssertNil(model.offlineText)
        XCTAssertFalse(model.hasMore)
    }

    func test_F006_AC6_searchFindsPartOfANameOrAnEmailAddressWhateverTheCase() async {
        let api = johnsGym()
        let model = model(api)
        await model.load()

        await model.search("VRIE")
        XCTAssertEqual(model.clients.map(\.name), ["Anna de Vries"], "part of a name")

        await model.search("bakker@EXAMPLE")
        XCTAssertEqual(model.clients.map(\.name), ["Sophie Bakker"], "part of an email address")

        await model.search("  nobody  ")
        XCTAssertEqual(model.state, .loaded)
        XCTAssertTrue(model.clients.isEmpty)
        XCTAssertEqual(model.query, "  nobody  ")

        await model.search("   ")
        XCTAssertEqual(model.clients.count, 3, "blank is no search")
        let sent = api.clients.searches
        XCTAssertEqual(sent, [nil, "VRIE", "bakker@EXAMPLE", "nobody", nil])
    }

    func test_F006_AC6_aLongListComesInPages() async {
        let api = StubAPI()
        api.clients.seed((1 ... 5).map { .init("Klant \($0)", "klant\($0)@example.com", nil) })
        let model = model(api, pageSize: 2)

        await model.load()
        XCTAssertEqual(model.clients.map(\.name), ["Klant 1", "Klant 2"])
        XCTAssertEqual(model.total, 5)
        XCTAssertTrue(model.hasMore)

        await model.loadMore(after: model.clients[0])
        XCTAssertEqual(model.clients.count, 2, "only the last rows ask for more")
        await model.loadMore(after: model.clients[1])
        XCTAssertEqual(model.clients.map(\.name), ["Klant 1", "Klant 2", "Klant 3", "Klant 4"])
        await model.loadMore(after: model.clients[3])
        XCTAssertEqual(model.clients.count, 5)
        XCTAssertFalse(model.hasMore)
        await model.loadMore(after: model.clients[4])
        XCTAssertEqual(api.clients.pages, [1, 2, 3], "nothing more to ask for")
    }

    func test_F006_AC12_aFailedFirstLoadShowsTheErrorAndLoadingAgainRecovers() async {
        let api = johnsGym()
        let model = model(api)
        for failure in [StubClients.Failure.offline, .status(500), .badRequest(["page"])] {
            api.clients.fail(.list, with: failure)
            await model.load()
            XCTAssertEqual(model.state, .failed, "\(failure)")
        }

        api.clients.fail(.list, with: nil)
        await model.load()

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.clients.count, 3)
    }

    func test_F006_AC12_whenTheRefreshCantConnectTheListStaysWithItsAge() async {
        let api = johnsGym()
        let updated = ISO8601DateFormatter().date(from: "2026-11-01T07:42:00Z") ?? .distantPast // 08:42 in Amsterdam
        let model = model(api, now: { updated })
        await model.load()
        XCTAssertNil(model.offlineText)

        api.clients.fail(.list, with: .offline)
        await model.refresh()

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.clients.count, 3, "the list that was shown stays")
        XCTAssertEqual(model.offlineText, String(format: TestCatalog(language)["clients.offline"], "08:42"))

        api.clients.fail(.list, with: nil)
        await model.refresh()
        XCTAssertNil(model.offlineText, "the banner goes once the API answers")
    }

    func test_F006_AC12_theOfflineTimeIsInTheWorkspacesTimeZone() async {
        let api = johnsGym()
        let tokyo = CurrentWorkspace(
            id: workspace.id, name: "Tokyo Gym", defaultLocale: .en,
            timeZone: TimeZone(identifier: "Asia/Tokyo") ?? .current
        )
        let updated = ISO8601DateFormatter().date(from: "2026-11-01T07:42:00Z") ?? .distantPast
        let model = model(api, now: { updated }, in: tokyo)
        await model.load()
        api.clients.fail(.list, with: .offline)
        await model.refresh()

        XCTAssertEqual(model.offlineText, String(format: TestCatalog(language)["clients.offline"], "16:42"))
    }

    func test_F006_AC12_aLoadThatTakesTenSecondsSaysSoUntilTheListIsThere() async {
        let clock = ManualClock()
        let model = model(johnsGym(), clock: clock)
        XCTAssertEqual(model.state, .loading)
        XCTAssertFalse(model.loadingSlow)

        let watching = Task { await model.watchSlowLoading() }
        await clock.untilSleeping()
        clock.advance(by: .seconds(9))
        XCTAssertFalse(model.loadingSlow, "not yet")
        clock.advance(by: .seconds(1))
        await watching.value
        XCTAssertTrue(model.loadingSlow, "after 10 seconds")
        XCTAssertEqual(Catalog(locale: language)[.commonLoadingSlow], TestCatalog(language)["common.loadingSlow"])

        await model.load()
        await model.watchSlowLoading()
        XCTAssertFalse(model.loadingSlow, "the list is there")
    }

    func test_F006_AC12_aLoadThatEndsBeforeTenSecondsSaysNothing() async {
        let clock = ManualClock()
        let model = model(johnsGym(), clock: clock)
        let watching = Task { await model.watchSlowLoading() }
        await clock.untilSleeping()

        watching.cancel()
        await watching.value

        XCTAssertFalse(model.loadingSlow)
    }

    func test_F006_AC12_aFailedSearchOrRefreshThatIsNotAConnectionKeepsTheListAndSaysSo() async {
        let api = johnsGym()
        let model = model(api)
        await model.load()

        api.clients.fail(.list, with: .status(503))
        await model.search("anna")

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.clients.count, 3, "the list that was shown stays")
        XCTAssertTrue(model.loadFailed)
        XCTAssertNil(model.offlineText)

        api.clients.fail(.list, with: nil)
        await model.search("anna")
        XCTAssertFalse(model.loadFailed)
        XCTAssertEqual(model.clients.map(\.name), ["Anna de Vries"])
    }

    func test_F006_AC10_noAccessShowsTheNoPermissionStateAndTellsTheHelperToHideTheAction() async {
        let api = johnsGym()
        var forbidden: [WorkspaceCapabilities.Capability] = []
        let model = model(api, forbidden: { forbidden.append($0) })

        api.clients.fail(.list, with: .forbidden)
        await model.load()

        XCTAssertEqual(model.state, .noPermission)
        XCTAssertEqual(forbidden, [.clients_view], "the helper learns the capability is gone")
        XCTAssertEqual(
            model.noPermissionText, String(format: TestCatalog(language)["noPermission.body"], "John's Gym")
        )

        api.clients.fail(.list, with: .notFound)
        await model.refresh()
        XCTAssertEqual(model.state, .noPermission, "no team access any more")
        XCTAssertEqual(forbidden, [.clients_view], "a 404 is not a missing capability")
    }

    func test_F006_AC12_anAddedOrEditedClientIsInTheListAtOnce() async {
        let api = johnsGym()
        let model = model(api)
        await model.load()

        model.didAdd(.init(id: "new", name: "Bram Visser", email: "bram@example.com"))
        XCTAssertEqual(model.clients.map(\.name), ["Anna de Vries", "Bram Visser", "Mark Jansen", "Sophie Bakker"])
        XCTAssertEqual(model.total, 4)

        let annaID = api.clients.id(of: "Anna de Vries") ?? ""
        model.didChange(.init(id: annaID, name: "Zoë de Vries", email: "zoe@example.com"))
        XCTAssertEqual(model.clients.map(\.name), ["Bram Visser", "Mark Jansen", "Sophie Bakker", "Zoë de Vries"])
        XCTAssertEqual(model.total, 4)
    }

    func test_F006_AC12_theTitlesComeFromTheCatalog() {
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)

        XCTAssertEqual(catalog[.clientsTitle], expected["clients.title"])
        XCTAssertEqual(catalog[.clientsSearchPlaceholder], expected["clients.searchPlaceholder"])
        XCTAssertEqual(catalog[.clientsNewClient], expected["clients.newClient"])
        XCTAssertEqual(catalog[.clientsEmpty], expected["clients.empty"])
        XCTAssertEqual(catalog[.clientsNoResults], expected["clients.noResults"])
        XCTAssertEqual(catalog[.clientsLoadError], expected["clients.loadError"])
    }
}
