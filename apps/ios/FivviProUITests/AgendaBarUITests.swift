import XCTest

/// TD-04 *Agenda* (F013, iOS), the bar and the touch targets, in nl and en against the stub server (the setup is
/// `AgendaUITests`').
extension AgendaUITests {
    func test_F013_design_theWeekAndMonthButtonsAreTouchTargetsOf44Points() throws {
        let (app, _) = try openAgenda()

        let previous = app.buttons["calendar.previous"], next = app.buttons["calendar.next"]
        XCTAssertTrue(previous.waitUntilExists(timeout: timeout), log)
        for button in [previous, next] {
            XCTAssertGreaterThanOrEqual(button.frame.width, 43.9, "\(button.identifier) is 44 pt wide")
            XCTAssertGreaterThanOrEqual(button.frame.height, 43.9, "\(button.identifier) is 44 pt tall")
        }
        let line = app.staticTexts["calendar.weekLine"]
        XCTAssertLessThanOrEqual(previous.frame.maxX, line.frame.minX + 1, "‹ is before the week line")
        XCTAssertGreaterThanOrEqual(next.frame.minX, line.frame.maxX - 1, "› is after it")
        XCTAssertGreaterThanOrEqual(day("2026-09-22", app).frame.width, 44, "and the days keep their width")

        mode("myCalendar.app.viewMonth", app)
        for id in ["calendar.previousMonth", "calendar.nextMonth"] {
            let button = app.buttons[id]
            XCTAssertTrue(button.waitUntilExists(timeout: timeout), log)
            XCTAssertGreaterThanOrEqual(button.frame.width, 43.9, id)
            XCTAssertGreaterThanOrEqual(button.frame.height, 43.9, id)
        }
    }

    func test_F013_design_plusIsInTheBarAndPlansASession() throws {
        let (app, _) = try openAgenda()

        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(plus.label, catalog["workspaceNav.new"], "Nieuw")
        XCTAssertTrue(plus.isEnabled)
        plus.tap()
        XCTAssertTrue(app.buttons["home.newPrivateSession"].waitUntilExists(timeout: timeout), "Privésessie is in it")
    }

    func test_F013_design_plusIsOffWithoutAConnection() throws {
        let (app, server) = try openAgenda()
        XCTAssertTrue(app.buttons["calendar.row.\(StubPersonalRoutes.anna)"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(app.buttons["home.new"].isEnabled)

        server.setOffline(true)
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()

        XCTAssertTrue(app.staticTexts["calendar.offline"].waitUntilExists(timeout: timeout), log)
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.exists)
        XCTAssertFalse(plus.isEnabled, "planning needs the server")
    }
}
