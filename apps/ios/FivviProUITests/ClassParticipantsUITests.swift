import XCTest

/// The participants on TD-03 (F025, #1616, iOS), in nl and en, against the stub server: "Kracht" with its seven participants
/// (synthetic) and the status each has, *Deelnemers · 7* with the first five rows and *Toon alle 7*, *Nog geen boekingen.* on
/// a date nobody has booked, and the rows at the largest text size.
@MainActor
final class ClassParticipantsUITests: AttendanceUITestCase {
    private let firstFive = Array(StubSessionRoutes.krachtNames.prefix(5))
    private let lastTwo = Array(StubSessionRoutes.krachtNames.dropFirst(5))

    private func participant(_ name: String, _ app: XCUIApplication) -> XCUIElement {
        any("classDate.participant.\(participantID(name))", in: app)
    }

    /// Scrolls until the element is on screen, above the tab bar.
    private func scrollTo(_ element: XCUIElement, _ app: XCUIApplication) {
        XCTAssertTrue(element.waitUntilExists(timeout: timeout), requestLog)
        let height = app.windows.firstMatch.frame.height
        for _ in 0..<10 where !element.isHittable || element.frame.maxY > height * 0.85 { app.swipeUp() }
    }

    func test_F025_1616_td03ListsTheParticipantsWithTheirStatusAndShowAllListsTheRest() throws {
        let (app, _) = try launchKracht(statuses: ["Anna": "attended", "Bram": "no_show"])

        let title = any("classDate.participantsTitle", in: app)
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, String(format: catalog["attendance.app.participantsCount"], "7"))
        let statuses = ["attended", "noShow", "booked", "booked", "booked"]
        for (name, status) in zip(firstFive, statuses) {
            let row = participant(name, app)
            XCTAssertTrue(row.waitUntilExists(timeout: timeout), "\(name): \(requestLog)")
            XCTAssertEqual(row.label, rowLabel(name, status), "one element: the name and the status the API has")
        }
        for name in lastTwo {
            XCTAssertFalse(participant(name, app).exists, "\(name) waits behind Toon alle 7")
        }

        let showAll = app.buttons["classDate.participants.showAll"]
        scrollTo(showAll, app)
        XCTAssertEqual(showAll.label, String(format: catalog["attendance.app.showAll"], "7"))
        XCTAssertGreaterThanOrEqual(showAll.frame.height, 44)
        showAll.tap()

        for name in lastTwo {
            XCTAssertTrue(participant(name, app).waitUntilExists(timeout: timeout), "\(name): \(requestLog)")
            XCTAssertEqual(participant(name, app).label, rowLabel(name, "booked"))
        }
        XCTAssertEqual(participant("Anna de Vries", app).label, rowLabel("Anna de Vries", "attended"))
        XCTAssertFalse(app.buttons["classDate.participants.showAll"].exists, "everyone is listed: the button is gone")
        XCTAssertEqual(title.label, String(format: catalog["attendance.app.participantsCount"], "7"))
    }

    func test_F025_1616_aDateWithoutParticipantsSaysThereAreNoBookings() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app

        let none = app.staticTexts["classDate.noBookings"]
        XCTAssertTrue(none.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(none.label, catalog["classes.date.noBookings"])
        XCTAssertFalse(any("classDate.participantsTitle", in: app).exists, "no header over an empty list")
        XCTAssertFalse(app.buttons["classDate.participants.showAll"].exists)
    }

    func test_F025_1616_atTheLargestTextSizeARowIsWholeAndTheButtonIsAsHighAsAFinger() throws {
        let (app, _) = try launchKracht(statuses: ["Bram": "no_show"], textSize: AppLaunch.largestTextSize)

        let row = participant("Bram Jansen", app)
        scrollTo(row, app)
        XCTAssertTrue(row.isHittable, "the row is on screen")
        XCTAssertEqual(row.label, rowLabel("Bram Jansen", "noShow"), "still one element")
        // The name and the status sit one under the other, so neither is cut: the row is higher than one line of 52 pt.
        XCTAssertGreaterThan(row.frame.height, 100)
        XCTAssertLessThanOrEqual(row.frame.maxX, app.windows.firstMatch.frame.width)

        let showAll = app.buttons["classDate.participants.showAll"]
        scrollTo(showAll, app)
        XCTAssertGreaterThanOrEqual(showAll.frame.height, 44)
        XCTAssertGreaterThanOrEqual(showAll.frame.width, 44)
    }
}
