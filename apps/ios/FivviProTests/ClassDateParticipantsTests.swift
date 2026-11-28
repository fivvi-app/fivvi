import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03's *Deelnemers · 7* (F025, #1616): the clients who hold a place with the status the API has for each, the first
/// five and *Toon alle 7* for the rest, nothing for a date without bookings (which the booked card says).
@MainActor
final class ClassDateParticipantsTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }

    private func screen(
        _ names: [String] = AttendanceFixtures.names,
        statuses: [String: Components.Schemas.SessionParticipant.AttendanceStatusPayload] = [:]
    ) async -> ClassDateViewModel {
        let api = SessionFixtures.api()
        let groupClass = api.classes.seed(
            nameNl: "Kracht", nameEn: "Strength", descriptionNl: nil, descriptionEn: nil, capacity: 8, trainer: nil
        )
        let people = names.map { name in
            let first = String(name.split(separator: " ")[0])
            return Components.Schemas.SessionParticipant(
                clientId: AttendanceFixtures.id(name), name: name, attendanceStatus: statuses[first] ?? .booked
            )
        }
        let date = api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-09-22", "18:00"), minutes: 60, capacity: 8, trainer: nil,
            participants: people
        )
        let model = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: date.id, catalog: Catalog(locale: language),
            canManage: true
        )
        await model.load()
        return model
    }

    func test_F025_1616_sevenParticipantsListTheFirstFiveAndShowAllSevenListsTheRest() async {
        let model = await screen()
        XCTAssertTrue(model.showsParticipants)
        XCTAssertEqual(model.participantsTitleText, String(format: catalog["attendance.app.participantsCount"], "7"))
        XCTAssertEqual(model.shownParticipants.map(\.name), Array(AttendanceFixtures.names.prefix(5)))
        XCTAssertTrue(model.showsAllParticipantsButton)
        XCTAssertEqual(model.showAllParticipantsText, String(format: catalog["attendance.app.showAll"], "7"))

        model.showAllParticipants()

        XCTAssertEqual(model.shownParticipants.map(\.name), AttendanceFixtures.names)
        XCTAssertFalse(model.showsAllParticipantsButton)
        XCTAssertEqual(model.participantsTitleText, String(format: catalog["attendance.app.participantsCount"], "7"))
    }

    func test_F025_1616_fiveParticipantsHaveNoShowAllButton() async {
        let model = await screen(Array(AttendanceFixtures.names.prefix(5)))
        XCTAssertEqual(model.shownParticipants.count, 5)
        XCTAssertFalse(model.showsAllParticipantsButton)
    }

    func test_F025_1616_aDateWithoutParticipantsHasNoList() async {
        let model = await screen([])
        XCTAssertFalse(model.showsParticipants)
        XCTAssertTrue(model.shownParticipants.isEmpty)
        XCTAssertFalse(model.showsAllParticipantsButton)
        XCTAssertTrue(model.showsNoBookings)
    }

    func test_F025_1616_aParticipantWhoCancelledIsNotListedOrCounted() async {
        let model = await screen(statuses: ["Gijs": .cancelled])
        XCTAssertEqual(model.participantsTitleText, String(format: catalog["attendance.app.participantsCount"], "6"))
        model.showAllParticipants()
        XCTAssertEqual(model.shownParticipants.map(\.name), Array(AttendanceFixtures.names.prefix(6)))
    }

    func test_F025_1616_eachRowHasTheStatusOfTheAPIAndReadsAsOneSentence() async {
        let model = await screen(statuses: ["Anna": .attended, "Bram": .noShow])
        let rows = model.shownParticipants
        XCTAssertEqual(rows.map(\.status), [.attended, .noShow, .booked, .booked, .booked])
        let (attended, noShow, booked) = (
            catalog["attendance.status.attended"], catalog["attendance.status.noShow"],
            catalog["attendance.status.booked"]
        )
        XCTAssertEqual(rows.map(\.statusText), [attended, noShow, booked, booked, booked])
        let label = catalog["attendance.app.rowLabel"]
        XCTAssertEqual(rows[0].spokenLabel, String(format: label, "Anna de Vries", attended.lowercased()))
        XCTAssertEqual(rows[1].spokenLabel, String(format: label, "Bram Jansen", noShow.lowercased()))
    }

    func test_F025_1616_theTextsFollowALanguageChange() async {
        let model = await screen()
        let other: Components.Schemas.Locale = language == .en ? .nlNL : .en
        let words = TestCatalog(other)
        model.use(Catalog(locale: other))
        XCTAssertEqual(model.participantsTitleText, String(format: words["attendance.app.participantsCount"], "7"))
        XCTAssertEqual(model.showAllParticipantsText, String(format: words["attendance.app.showAll"], "7"))
        XCTAssertEqual(model.shownParticipants[0].statusText, words["attendance.status.booked"])
    }
}
