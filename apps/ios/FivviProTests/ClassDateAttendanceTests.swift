import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03's *Aanwezigheid invullen* (F025 AC4): the button that opens CO-05 for the class date, off while nobody has a place
/// on it and gone on a cancelled one.
@MainActor
final class ClassDateAttendanceTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }

    private func screen(participants: Int, cancelled: Bool = false) async -> ClassDateViewModel {
        let api = SessionFixtures.api()
        let groupClass = api.classes.seed(
            nameNl: "Kracht", nameEn: "Strength", descriptionNl: nil, descriptionEn: nil, capacity: 8, trainer: nil
        )
        let people = AttendanceFixtures.names.prefix(participants).map {
            Components.Schemas.SessionParticipant(
                clientId: AttendanceFixtures.id($0), name: $0, attendanceStatus: .booked
            )
        }
        let date = api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-09-22", "18:00"), minutes: 60, capacity: 8, trainer: nil,
            participants: people
        )
        if cancelled { _ = try? api.sessions.cancelClass(date.id, .init(scope: .this, version: 1)) }
        let model = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: date.id, catalog: Catalog(locale: language),
            canManage: true
        )
        await model.load()
        return model
    }

    func test_F025_AC4_theButtonOpensCO05WithTheNameAndTheTimeUnderItsTitle() async {
        let model = await screen(participants: 7)
        XCTAssertTrue(model.showsAttendance)
        XCTAssertTrue(model.canTakeAttendance)
        XCTAssertEqual(model.attendanceTakeText, catalog["attendance.app.take"])
        let name = language == .en ? "Strength" : "Kracht"
        XCTAssertEqual(
            model.attendanceRoute?.subtitle,
            "\(name) · " + String(format: catalog["myDay.timeRange"], "19:00", "18:00")
        )
        XCTAssertEqual(model.attendanceRoute?.workspaceID, SessionFixtures.workspace.id)
    }

    func test_F025_theButtonIsOffWithoutParticipants() async {
        let model = await screen(participants: 0)
        XCTAssertTrue(model.showsAttendance)
        XCTAssertFalse(model.canTakeAttendance)
    }

    func test_F025_AC6_aCancelledDateHasNoButton() async {
        let model = await screen(participants: 7, cancelled: true)
        XCTAssertFalse(model.showsAttendance)
    }
}
