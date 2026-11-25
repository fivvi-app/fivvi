import XCTest

/// The class level on Fivvi Pro (F067, iOS), in nl and en, against the stub server: *Niveau* in **+** → *Groepsles* (TD-05)
/// and the level in the eyebrow of the class screen (TD-03) with the bars, for the Owner and the Trainer. John is the
/// Owner, Sarah the Trainer (synthetic); the seeded class is *Kracht* (*Strength*) tomorrow at 18:00.
@MainActor
final class ClassLevelUITests: PrivateSessionUITestCase {
    private func word(_ key: String) -> String { catalog["classLevel.\(key)"] }

    private func eyebrow(_ app: XCUIApplication) -> String {
        app.staticTexts["largeTitle.eyebrow"].label.lowercased()
    }

    private func expected(_ key: String) -> String {
        String(format: catalog["classes.date.typeAndLevel"], word(key), catalog["workspaceNav.newGroupClass"])
            .lowercased()
    }

    /// **+** → *Groepsles* and the name typed.
    private func openNewClass(_ app: XCUIApplication, name: String) {
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout), requestLog)
        plus.tap()
        let item = app.buttons["home.newGroupClass"]
        XCTAssertTrue(item.waitUntilExists(timeout: timeout), requestLog)
        item.tap()
        XCTAssertTrue(app.staticTexts["newClass.title"].waitUntilExists(timeout: timeout), requestLog)
        let field = app.textFields["newClass.nameNl"].firstMatch
        XCTAssertTrue(field.waitUntilExists(timeout: timeout))
        field.tap()
        field.typeText(name)
    }

    func test_F067_AC1_johnAddsReformerPowerWithGevorderdAndTD03OpensWithTheLevelInTheEyebrow() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app, name: "Reformer Power")
        let level = any("newClass.level", in: app)
        XCTAssertTrue(level.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(level.label.contains(word("none")), "Geen is the starting value: \(level.label)")
        level.tap()
        let advanced = app.buttons[word("advanced")].firstMatch
        XCTAssertTrue(advanced.waitUntilExists(timeout: timeout), requestLog)
        advanced.tap()
        app.buttons["newClass.save"].tap()

        let title = app.staticTexts["classDate.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, "Reformer Power")
        XCTAssertEqual(try XCTUnwrap(server.createdGroupClasses.first)["level"], "advanced")
        XCTAssertEqual(eyebrow(app), expected("advanced"), "Groepsles · Gevorderd / Group class · Advanced")
        let icon = any("classDate.level", in: app)
        XCTAssertTrue(icon.waitUntilExists(timeout: timeout))
        XCTAssertEqual(icon.label, String(format: catalog["classLevel.accessibleName"], word("advanced")))
    }

    func test_F067_AC1_withGeenTheCreateSendsNoLevel() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app, name: "Mobility")
        app.buttons["newClass.save"].tap()
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertNil(try XCTUnwrap(server.createdGroupClasses.first)["level"])
        XCTAssertFalse(any("classDate.level", in: app).exists, "Geen shows nothing")
    }

    private func assertLevelOnTD03(_ key: String, raw: String, owner: Bool) throws {
        let (screen, _) = try launch(
            owner: owner, opensClassDate: StubSessionRoutes.seededClassDateID, seededLevel: raw
        )
        let app = screen.app
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(eyebrow(app), expected(key))
        let icon = any("classDate.level", in: app)
        XCTAssertTrue(icon.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(icon.label, String(format: catalog["classLevel.accessibleName"], word(key)))
    }

    func test_F067_AC7_allLevelsShowsTheBarsAndTheWord() throws {
        try assertLevelOnTD03("allLevels", raw: "all_levels", owner: true)
    }

    func test_F067_AC7_beginnerShowsTheBarsAndTheWord() throws {
        try assertLevelOnTD03("beginner", raw: "beginner", owner: true)
    }

    func test_F067_AC7_gemiddeldShowsTheBarsAndTheWord() throws {
        try assertLevelOnTD03("intermediate", raw: "intermediate", owner: true)
    }

    func test_F067_AC7_gevorderdShowsTheBarsAndTheWord() throws {
        try assertLevelOnTD03("advanced", raw: "advanced", owner: true)
    }

    /// AC13: the accessibility audit finds no violation on what the level adds to TD-03: its eyebrow and its bars. The rest
    /// of the screen is not this ticket's: its own findings (the cut description) are not counted here.
    func test_F067_AC13_theClassScreenWithALevelPassesTheAccessibilityAudit() throws {
        let (screen, _) = try launch(
            owner: true, opensClassDate: StubSessionRoutes.seededClassDateID, seededLevel: "advanced"
        )
        XCTAssertTrue(screen.app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(any("classDate.level", in: screen.app).waitUntilExists(timeout: timeout))
        try screen.app.performAccessibilityAudit(for: [.textClipped, .hitRegion]) { issue in
            let id = issue.element?.identifier ?? "-"
            guard id == "classDate.level" || id == "largeTitle.eyebrow" else { return true }
            XCTFail("\(issue.auditType) on \(id) \(issue.element?.label ?? "") \(issue.element?.frame ?? .zero)")
            return true
        }
    }

    func test_F067_AC7_geenShowsNothingAboutALevel() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(eyebrow(app), catalog["workspaceNav.newGroupClass"].lowercased(), "just the type")
        XCTAssertFalse(eyebrow(app).contains("·"), "no stray separator")
        XCTAssertFalse(any("classDate.level", in: app).exists)
    }

    func test_F067_AC8_sarahTheTrainerSeesTheSameLevelAndHasNoControlThatChangesIt() throws {
        let (screen, _) = try launch(
            opensClassDate: StubSessionRoutes.seededClassDateID, seededLevel: "advanced"
        )
        let app = screen.app
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(eyebrow(app), expected("advanced"))
        XCTAssertTrue(any("classDate.level", in: app).exists)
        XCTAssertFalse(app.buttons["classDate.menu"].exists, "no ⋯ menu")
        XCTAssertFalse(app.buttons["classDate.edit"].exists)
        XCTAssertFalse(app.pickers.firstMatch.exists)
        XCTAssertFalse(any("newClass.level", in: app).exists, "no Niveau field for her")
    }
}
