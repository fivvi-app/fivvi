import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Komende sessies* on the client profile (F020 AC9, iOS), and the helpers the session screens share. The test plan
/// runs every test in nl and en.
@MainActor
final class ClientUpcomingSessionsTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func profile(_ api: StubAPI, _ name: String) -> ClientProfileViewModel {
        ClientProfileViewModel(
            api: api, workspace: SessionFixtures.workspace, clientID: SessionFixtures.client(api, name).id,
            catalog: Catalog(locale: language)
        )
    }

    func test_F020_AC9_theProfileListsTheComingSessionsSoonestFirstInTheWorkspacesTimeZone() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let api = SessionFixtures.api()
        let anna = SessionFixtures.client(api, "Anna de Vries")
        let later = Date().addingTimeInterval(3 * 86_400)
        let sooner = Date().addingTimeInterval(86_400)
        api.sessions.seed(client: anna, start: later)
        api.sessions.seed(client: anna, start: sooner)
        api.sessions.seed(client: SessionFixtures.client(api, "Mark Jansen"), start: sooner)
        let screen = profile(api, "Anna de Vries")
        XCTAssertNil(screen.upcoming, "nothing before the read")

        await screen.load()

        let coming = try XCTUnwrap(screen.upcoming?.sessions)
        XCTAssertEqual(coming.count, 2, "only Anna's")
        XCTAssertLessThan(coming[0].startsAt, coming[1].startsAt)
        let catalog = TestCatalog(language)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(
            screen.upcomingText(coming[0]),
            String(
                format: catalog["clients.profile.upcomingWhen"], format.day(coming[0].startsAt),
                format.time(coming[0].startsAt)
            )
        )
    }

    func test_F020_AC9_aClientWithoutComingSessionsHasAnEmptyList() async {
        let api = SessionFixtures.api()
        let screen = profile(api, "Mark Jansen")
        await screen.load()
        XCTAssertEqual(screen.upcoming?.sessions.count, 0, "the empty text shows")
    }

    func test_F020_AC9_aFailedReadOfTheSessionsLeavesTheOverviewAndShowsNoList() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.upcoming, with: .offline)
        let screen = profile(api, "Anna de Vries")
        await screen.load()
        XCTAssertEqual(screen.state, .loaded)
        XCTAssertNil(screen.upcoming)
    }
}
