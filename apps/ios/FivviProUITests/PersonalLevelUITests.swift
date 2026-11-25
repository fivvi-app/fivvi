import XCTest

/// The class level on the rows of Vandaag (TD-01) and Agenda (TD-04) (F067, iOS), in nl and en, against the stub server:
/// Sarah's Tuesday 22 September 2026 at 08:35 with the class "Kracht" at 15:00 in John's Gym. Sarah is a Trainer there, John
/// its Owner (synthetic). The bars are part of the row's text and the row is one element for VoiceOver, so the tests read
/// its label; how the bars are drawn and where they sit is checked in `PersonalRowLevelTests`.
@MainActor
final class PersonalLevelUITests: SignInUITestCase {
    private var catalog: TestCatalog { TestCatalog.configured }
    private var server: StubServer?
    private let kracht = StubPersonalRoutes.kracht

    private func launch(level: String?, owner: Bool = false) throws -> XCUIApplication {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: owner ? "owner@example.com" : "trainer@example.com", workspaceName: "John's Gym",
            role: owner ? "owner" : "trainer",
            otherWorkspaces: owner ? [] : [.init(name: "Sarah Personal Training", role: "owner")],
            name: owner ? "John Smit" : "Sarah Visser"
        ))
        server.personalDay = .sarah
        server.personalClassLevel = level
        self.server = server
        return AppLaunch.launch(against: server, session: .signedIn, startTab: nil, now: "2026-09-22T08:35:00+02:00")
    }

    private var log: String { (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n") }

    private func levelName(_ key: String) -> String {
        String(format: catalog["classLevel.accessibleName"], catalog["classLevel.\(key)"])
    }

    /// *Niveau* / *Level*, the start of every level name: a row without an icon has none of it.
    private var levelPrefix: String {
        String(format: catalog["classLevel.accessibleName"], "").components(separatedBy: ":")[0]
    }

    private func vandaagRow(_ app: XCUIApplication) -> XCUIElement {
        let row = app.buttons["today.row.\(kracht)"]
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), log)
        return row
    }

    private func agendaRow(_ app: XCUIApplication) -> XCUIElement {
        let tab = app.tabBars.buttons["tab.calendar"]
        XCTAssertTrue(tab.waitUntilExists(timeout: timeout), log)
        tab.tap()
        let row = app.buttons["calendar.row.\(kracht)"]
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), log)
        return row
    }

    /// The label names the class first and its level right after it.
    private func assertLevelAfterName(
        _ row: XCUIElement, _ key: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        let label = row.label
        guard let name = label.range(of: "Kracht"), let level = label.range(of: levelName(key)) else {
            return XCTFail("the label has the name and the level: \(label)", file: file, line: line)
        }
        XCTAssertLessThan(name.upperBound, level.lowerBound, label, file: file, line: line)
    }

    func test_F067_AC5_sarahsVandaagAndAgendaNameTheLevelRightAfterTheClassForVoiceOver() throws {
        let app = try launch(level: "advanced")
        assertLevelAfterName(vandaagRow(app), "advanced")
        assertLevelAfterName(agendaRow(app), "advanced")
    }

    func test_F067_AC5_aBeginnerAndAGemiddeldRowNameTheirOwnLevel() throws {
        let app = try launch(level: "intermediate")
        assertLevelAfterName(vandaagRow(app), "intermediate")
    }

    func test_F067_AC6_aDateWithAlleNiveausShowsNoIconInTheRow() throws {
        let app = try launch(level: "all_levels")
        let without = vandaagRow(app).label
        XCTAssertFalse(without.contains(catalog["classLevel.allLevels"]), without)
        XCTAssertFalse(without.contains(levelPrefix), without)
        XCTAssertFalse(agendaRow(app).label.contains(levelPrefix))
    }

    func test_F067_AC6_aDateWithGeenShowsNoIconInTheRow() throws {
        let app = try launch(level: nil)
        let label = vandaagRow(app).label
        XCTAssertFalse(label.contains(levelPrefix), label)
        XCTAssertTrue(label.contains("Kracht"), label)
    }

    func test_F067_AC8_johnSeesTheSameLevelOnHisRowsAndTheRowHasNoWayToChangeIt() throws {
        let app = try launch(level: "advanced", owner: true)
        let row = vandaagRow(app)
        assertLevelAfterName(row, "advanced")
        XCTAssertFalse(app.pickers.firstMatch.exists, "no level control on the list")
        XCTAssertFalse(app.buttons["classDate.edit"].exists)
        assertLevelAfterName(agendaRow(app), "advanced")
    }

    func test_F067_AC13_vandaagAndAgendaWithALevelPassTheAccessibilityAudit() throws {
        let app = try launch(level: "advanced")
        _ = vandaagRow(app)
        try audit(app)
        _ = agendaRow(app)
        try audit(app)
    }

    /// The audit finds nothing on the class rows, where the bars are: the rest of the screen is not this ticket's (the
    /// strip's dots and the labels under the tab bar have findings of their own).
    private func audit(_ app: XCUIApplication) throws {
        try app.performAccessibilityAudit(for: [.textClipped, .hitRegion]) { issue in
            let id = issue.element?.identifier ?? "-"
            guard id.hasSuffix(".row.\(self.kracht)") else { return true }
            XCTFail("\(issue.auditType) on \(id) \(issue.element?.label ?? "") \(issue.element?.frame ?? .zero)")
            return true
        }
    }
}
