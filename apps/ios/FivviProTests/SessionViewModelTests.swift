import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-02 *Privésessie* (F020 AC10 and the design of the session screen, iOS). The test plan runs every test in nl and en.
@MainActor
final class SessionViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    /// `memberID`: the person looking, by their team-member ID in the workspace (the Owner's unless given).
    private func model(_ api: StubAPI, id: String, memberID: String = StubSessions.myMemberID) -> SessionViewModel {
        SessionViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: id,
            catalog: Catalog(locale: language)
        )
    }

    private func planned(
        _ api: StubAPI, trainer: Components.Schemas.SessionTrainer? = .init(id: StubSessions.myMemberID, name: "Owner")
    ) -> Components.Schemas.Session {
        api.sessions.seed(
            client: SessionFixtures.client(api, "Anna de Vries"), start: SessionFixtures.at("2026-11-19", "09:00"),
            trainer: trainer
        )
    }

    func test_F020_AC10_theScreenShowsTheTitleTheTimeAndTheClientAsTheWebDoes() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id)
        XCTAssertEqual(screen.state, .loading)

        await screen.load()

        let catalog = TestCatalog(language)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(screen.state, .loaded)
        XCTAssertEqual(screen.title, String(format: catalog["sessions.page.heading"], "Anna de Vries"))
        XCTAssertEqual(
            screen.whenText,
            String(format: catalog["sessions.page.timeRange"], format.longDay(session.startsAt), "10:00", "09:00")
        )
        XCTAssertEqual(screen.locationName, "John's Gym")
        XCTAssertEqual(screen.client?.clientId, SessionFixtures.client(api, "Anna de Vries").id)
        XCTAssertFalse(screen.isCancelled)
    }

    func test_F020_AC10_theTrainerRowSaysYouForThePersonLookingAndTheNameForAnother() async {
        let api = SessionFixtures.api()
        let mine = planned(api)
        let theirs = planned(api, trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser"))
        let catalog = TestCatalog(language)

        let own = model(api, id: mine.id)
        await own.load()
        XCTAssertEqual(own.trainerText, catalog["sessions.page.you"], "Jij / You, by the team-member ID")

        let other = model(api, id: theirs.id)
        await other.load()
        XCTAssertEqual(other.trainerText, "Sarah Visser")
    }

    func test_F020_1414_AC2_twoTrainersWithTheSameNameEachSeeYouOnlyOnTheirOwnSessions() async {
        let api = SessionFixtures.api()
        let firstID = "5b1c2d3e-0000-4000-8000-0000000000c1"
        let secondID = "5b1c2d3e-0000-4000-8000-0000000000c2"
        let first = planned(api, trainer: .init(id: firstID, name: "Sarah Visser"))
        let second = planned(api, trainer: .init(id: secondID, name: "Sarah Visser"))
        let catalog = TestCatalog(language)

        // A Trainer can't read the team: the ID from `GET /me` is all they have, and it is enough.
        let asFirst = model(api, id: first.id, memberID: firstID)
        await asFirst.load()
        XCTAssertEqual(asFirst.trainerText, catalog["sessions.page.you"])
        let firstOnSecond = model(api, id: second.id, memberID: firstID)
        await firstOnSecond.load()
        XCTAssertEqual(firstOnSecond.trainerText, "Sarah Visser", "the namesake's session is not theirs")

        let asSecond = model(api, id: second.id, memberID: secondID)
        await asSecond.load()
        XCTAssertEqual(asSecond.trainerText, catalog["sessions.page.you"])
    }

    func test_F020_AC10_aSessionWithoutATrainerSaysNoTrainerInTheWorkspacesWord() async {
        let api = SessionFixtures.api()
        let session = planned(api, trainer: nil)
        let screen = model(api, id: session.id)
        await screen.load()
        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(screen.trainerText, String(format: TestCatalog(language)["sessions.page.noTrainer"], words.word))
    }

    func test_F020_Design_theRouteOpensTheMapsAppWithTheAddressAndNothingWithoutOne() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id)
        await screen.load()

        let url = try XCTUnwrap(screen.routeURL)
        XCTAssertEqual(url.host, "maps.apple.com")
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        XCTAssertEqual(parts?.queryItems?.first { $0.name == "daddr" }?.value, "Kerkstraat 12 A, 1234 AB Amsterdam")

        api.sessions.setLocation(.init(
            id: "6d1c2d3e-0000-4000-8000-0000000000b2", name: "Het park", _type: .outdoor, address: nil, isDefault: true
        ))
        let outdoors = api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-20", "09:00")
        )
        let park = model(api, id: outdoors.id)
        await park.load()
        XCTAssertNil(park.routeURL, "no address, no Route")
        XCTAssertEqual(park.locationName, "Het park")
    }

    func test_F020_AC6_aCancelledSessionIsNotMovedAndSaysSo() async {
        let api = SessionFixtures.api()
        let session = api.sessions.seed(
            client: SessionFixtures.client(api, "Anna de Vries"), start: SessionFixtures.at("2026-11-19", "09:00"),
            cancelled: true
        )
        let screen = model(api, id: session.id)
        await screen.load()
        XCTAssertTrue(screen.isCancelled)
        XCTAssertNil(screen.rescheduleForm(), "a cancelled session is not moved")
        XCTAssertEqual(screen.cancelledText, TestCatalog(language)["sessions.page.cancelled"])
    }

    func test_F020_AC6_theMoveFormKnowsTheClientsLanguageAndAMoveUpdatesTheScreen() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id)
        await screen.load()
        let form = try XCTUnwrap(screen.rescheduleForm(now: SessionFixtures.now))
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            form.notifyNote,
            String(
                format: catalog["sessions.reschedule.notifyNote"], "Anna de Vries",
                catalog["sessions.form.languageEn"]
            )
        )

        form.time.start = SessionFixtures.at("2026-11-20", "11:00")
        let saved = await form.save()
        let moved = try XCTUnwrap(saved)
        screen.didMove(moved, text: form.movedText(moved))

        XCTAssertEqual(screen.session?.version, 2)
        XCTAssertEqual(screen.movedText, form.movedText(moved))
        await screen.refresh()
        XCTAssertEqual(screen.movedText, form.movedText(moved), "the same version: the message stays")
    }

    func test_F020_AC10_aSessionTheTeamMayNotSeeOrThatIsGoneSaysThereIsNoAccess() async {
        let api = SessionFixtures.api()
        let missing = model(api, id: "8a0b1c2e-8a54-4b51-9a42-000000000099")
        await missing.load()
        XCTAssertEqual(missing.state, .noPermission)

        api.sessions.fail(.get, with: .forbidden)
        let refused = model(api, id: planned(api).id)
        await refused.load()
        XCTAssertEqual(refused.state, .noPermission)
    }

    func test_F020_AC10_aFailedReadSaysSoAndKeepsWhatWasShown() async {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id)
        api.sessions.fail(.get, with: .offline)
        await screen.load()
        XCTAssertEqual(screen.state, .failed)

        api.sessions.fail(.get, with: nil)
        await screen.load()
        XCTAssertEqual(screen.state, .loaded)
        api.sessions.fail(.get, with: .offline)
        await screen.refresh()
        XCTAssertEqual(screen.state, .loaded, "a later failed read keeps the session on screen")
        XCTAssertNotNil(screen.session)
    }
}
