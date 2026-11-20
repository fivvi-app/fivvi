import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// PS-07 *Dubbele boeking* (F023 AC6, iOS): how the alert words what the API listed. The test plan runs every test in
/// nl and en.
final class DoubleBookingTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func item(
        _ type: Components.Schemas.TrainerConflictItem._TypePayload, _ name: String, english: String? = nil,
        start: String, end: String
    ) -> Components.Schemas.TrainerConflictItem {
        .init(
            sessionId: UUID().uuidString, _type: type, startsAt: SessionFixtures.at("2026-09-24", start),
            endsAt: SessionFixtures.at("2026-09-24", end), displayName: name, displayNameEn: english
        )
    }

    func test_F023_AC6_everyOverlappingSessionIsOneLineWithItsTypeInTheWorkspacesTimeZone() {
        let catalog = Catalog(locale: language)
        let format = SessionFormat(locale: catalog.formattingLocale, timeZone: SessionFixtures.amsterdam)
        let booking = DoubleBooking(
            conflicts: [
                item(._private, "Mark Jansen", start: "09:00", end: "10:00"),
                item(.group, "Kracht", english: "Strength", start: "09:30", end: "10:30"),
                item(.openGym, "Open Gym", start: "09:45", end: "11:00")
            ],
            trainerName: "Tom"
        )

        let lines = booking.message(catalog, format: format).components(separatedBy: "\n")

        let words = TestCatalog(language)
        let day = format.day(SessionFixtures.at("2026-09-24", "09:00"))
        let classText = language == .en ? "Strength" : "Kracht"
        XCTAssertEqual(
            lines,
            [
                String(format: words["sessions.doubleBooking.item"], day, "10:00", "Mark Jansen", "09:00",
                       words["sessions.doubleBooking.typePrivate"]),
                String(format: words["sessions.doubleBooking.item"], day, "10:30", classText, "09:30",
                       words["sessions.doubleBooking.typeGroup"]),
                String(format: words["sessions.doubleBooking.item"], day, "11:00", "Open Gym", "09:45",
                       words["sessions.doubleBooking.typeOpenGym"])
            ]
        )
    }

    func test_F023_AC6_theTitleNamesTheTrainerOrSaysYouWhenThePersonPlansForThemself() {
        let catalog = Catalog(locale: language)
        let words = TestCatalog(language)
        XCTAssertEqual(
            DoubleBooking(conflicts: [], trainerName: "Tom").title(catalog),
            String(format: words["sessions.doubleBooking.title"], "Tom")
        )
        XCTAssertEqual(
            DoubleBooking(conflicts: [], trainerName: nil).title(catalog), words["sessions.doubleBooking.titleOwn"]
        )
    }
}
