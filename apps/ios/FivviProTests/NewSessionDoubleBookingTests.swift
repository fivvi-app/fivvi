import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// PS-07 *Dubbele boeking* on PS-04 (F023 AC5, AC6, iOS): the API's `409 trainer_conflict` is a warning, *Terug* keeps
/// the form and *Toch opslaan* sends the same request with `allowConflicts`. The test plan runs every test in nl and en.
@MainActor
final class NewSessionDoubleBookingTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func form(
        _ api: StubAPI, forAnyTrainer: Bool = false, email: String = "sarah@example.com", name: String? = "Sarah Visser"
    ) -> NewSessionViewModel {
        NewSessionViewModel(
            api: api, workspace: SessionFixtures.workspace, catalog: Catalog(locale: language),
            forAnyTrainer: forAnyTrainer, email: email, accountName: name, now: SessionFixtures.now
        )
    }

    /// What the alert says of the overlapping session, as `DoubleBooking` words it for the form's language.
    private func line(_ model: NewSessionViewModel, _ day: String, _ start: String, _ end: String) -> String {
        let format = model.time.format
        let catalog = TestCatalog(language)
        return String(
            format: catalog["sessions.doubleBooking.item"], format.day(SessionFixtures.at(day, start)), end,
            "Mark Jansen", start, catalog["sessions.doubleBooking.typePrivate"]
        )
    }

    func test_F023_AC6_aTrainerWhoOverlapsTheirOwnSessionIsWarnedAndSaveAnywayPlansIt() async throws {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "09:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Sarah Visser")
        )
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNil(planned, "nothing was stored")
        let catalog = TestCatalog(language)
        XCTAssertEqual(model.doubleBookingTitle, catalog["sessions.doubleBooking.titleOwn"], "Je hebt dan al iets")
        XCTAssertEqual(model.doubleBookingMessage, line(model, "2026-11-16", "09:00", "10:00"))
        XCTAssertEqual(model.doubleBookingBackText, catalog["sessions.doubleBooking.back"])
        XCTAssertEqual(model.doubleBookingSaveAnywayText, catalog["sessions.doubleBooking.saveAnyway"])
        XCTAssertNil(model.saveFailureText, "a warning is not a failure")
        XCTAssertNotEqual(api.sessions.plans.first?.allowConflicts, true, "the first save asks the API to check")

        let anyway = await model.save(allowConflicts: true)

        XCTAssertNotNil(anyway, "Toch opslaan saves")
        XCTAssertEqual(api.sessions.plans.count, 2)
        XCTAssertEqual(api.sessions.plans.last?.allowConflicts, true)
        XCTAssertEqual(api.sessions.plans.last?.localStart, "09:00", "the same request, sent again")
        XCTAssertNil(model.doubleBooking)
        XCTAssertEqual(api.sessions.all.count, 2)
    }

    func test_F023_AC6_anOwnerPlanningForAnotherTrainerSeesTheirNameInTheTitle() async {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "09:30"),
            trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser")
        )
        let model = form(api, forAnyTrainer: true, email: "owner@example.com", name: "Owner")
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        model.trainerID = StubSessions.myMemberID
        let own = await model.save()
        XCTAssertNotNil(own, "the Owner themself has nothing then")
        XCTAssertNil(model.doubleBooking)

        model.trainerID = StubSessions.otherMemberID
        let other = await model.save()

        XCTAssertNil(other)
        let title = TestCatalog(language)["sessions.doubleBooking.title"]
        XCTAssertEqual(model.doubleBookingTitle, String(format: title, "Sarah Visser"))
    }

    func test_F023_AC6_backKeepsTheFormAndSendsNothingMoreAndASecondSaveWarnsAgain() async {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "09:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Sarah Visser")
        )
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")
        _ = await model.save()
        XCTAssertNotNil(model.doubleBooking)

        model.dismissDoubleBooking()

        XCTAssertNil(model.doubleBooking)
        XCTAssertEqual(api.sessions.plans.count, 1, "Terug sends nothing")
        XCTAssertEqual(model.client?.name, "Anna de Vries", "what was typed stays")
        XCTAssertTrue(model.canSave)
        _ = await model.save()
        XCTAssertNotNil(model.doubleBooking, "saving again warns again")
        XCTAssertEqual(api.sessions.all.count, 1)
    }

    func test_F023_AC5_aSessionThatStartsWhenTheOtherEndsIsNoConflict() async {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "08:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Sarah Visser")
        )
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNotNil(planned, "back-to-back is no overlap")
        XCTAssertNil(model.doubleBooking)
    }
}
