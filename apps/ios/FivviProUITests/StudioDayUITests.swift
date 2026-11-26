import XCTest

/// The Owner's *Mijn dag | Hele studio* on Vandaag (F014 AC11, iOS), in nl and en, against the stub server: Tuesday
/// 22 September 2026 at 08:35 in John's Gym, where John (the Owner, who also trains) has Sarah and Tom on the team
/// (synthetic). The studio's day is read-only.
@MainActor
final class StudioDayUITests: SignInUITestCase {
    private var catalog: TestCatalog { TestCatalog.configured }
    private var server: StubServer?

    private func launch(
        role: String = "owner", hasTeam: Bool = true, name: String = "John Visser", trainerWord: String = "trainer"
    ) throws -> (XCUIApplication, StubServer) {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "john@example.com", workspaceName: "John's Gym", role: role, trainerWord: trainerWord, name: name,
            hasTeam: hasTeam
        ))
        self.server = server
        let app = AppLaunch.launch(against: server, session: .signedIn, startTab: nil, now: "2026-09-22T08:35:00+02:00")
        return (app, server)
    }

    private var log: String { (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n") }

    private func any(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private var words: String { catalog["trainerWord.trainer.words"] }

    /// F068 AC1: John's Gym uses *instructeur*, so the studio's day talks about its *instructeurs* (*instructors*).
    func test_F068_AC1_theStudioDaySaysTheWorkspacesWord() throws {
        let (app, _) = try launch(trainerWord: "instructeur")
        let control = app.segmentedControls["today.scope"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), log)
        control.buttons[catalog["myDay.app.scopeStudio"]].tap()

        let line = app.staticTexts["today.scope.line"]
        XCTAssertTrue(line.waitUntilExists(timeout: timeout), log)
        let plural = catalog["trainerWord.instructeur.words"]
        XCTAssertEqual(line.label, String(format: catalog["myDay.app.studioLine"], plural, "John's Gym"))
        XCTAssertEqual(plural, TestCatalog.configuredLanguage == "nl" ? "instructeurs" : "instructors")
        XCTAssertEqual(
            app.staticTexts["today.studio.head"].label,
            String(format: catalog["myDay.app.studioTrainersMany"], "3", plural)
        )
    }

    func test_F014_AC11_ownerTogglesWorkspaceDay() throws {
        let (app, server) = try launch()
        let control = app.segmentedControls["today.scope"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(control.buttons[catalog["myDay.app.scopeMine"]].isSelected, "the default is Mijn dag")
        XCTAssertTrue(control.buttons[catalog["myDay.app.scopeStudio"]].exists)

        control.buttons[catalog["myDay.app.scopeStudio"]].tap()

        let line = app.staticTexts["today.scope.line"]
        XCTAssertTrue(line.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(line.label, String(format: catalog["myDay.app.studioLine"], words, "John's Gym"))
        XCTAssertEqual(
            app.staticTexts["today.studio.head"].label,
            String(format: catalog["myDay.app.studioTrainersMany"], "3", words)
        )
        XCTAssertEqual(
            app.staticTexts["today.studio.busiest"].label,
            String(format: catalog["myDay.app.studioBusiest"], "2", "18:00", "19:00"),
            "Drukst 18:00–19:00 · 2 tegelijk"
        )
        let lanes = [
            catalog["myDay.app.studioYou"], StubPersonalRoutes.sarahName.components(separatedBy: " ")[0],
            StubSessionRoutes.otherTrainerName.components(separatedBy: " ")[0]
        ]
        XCTAssertTrue(app.staticTexts[lanes[0]].exists, "John's lane reads Jij")
        XCTAssertTrue(app.staticTexts[lanes[1]].exists)
        XCTAssertTrue(app.staticTexts[lanes[2]].exists)
        let kracht = app.buttons["today.studio.block.\(StubPersonalRoutes.kracht)"]
        XCTAssertTrue(kracht.exists, "Sarah's Kracht is a block of her lane")
        let named = String(format: catalog["myDay.app.studioBlock"], "10:00", "Kracht", StubPersonalRoutes.sarahName)
        XCTAssertEqual(kracht.label, named)
        XCTAssertGreaterThanOrEqual(kracht.frame.height, 44, "a block is touched on at least 44 pt")
        // Rows, each with its trainer.
        let lisa = app.buttons["today.row.\(StubPersonalRoutes.studioLisa)"]
        XCTAssertTrue(lisa.exists, "Lisa's session of Tom is a row")
        XCTAssertTrue(lisa.label.contains(StubSessionRoutes.otherTrainerName), lisa.label)
        let anna = app.buttons["today.row.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(anna.label.contains(catalog["myDay.app.studioYou"]), "John's own session says Jij: \(anna.label)")
        XCTAssertTrue(any("today.studio.next", app).exists, "the next card")
        XCTAssertTrue(
            server.requests.contains { $0.path == "/api/v1/workspaces/\(Responder.workspaceID(0))/day" },
            "the day of the current workspace\n\(log)"
        )

        kracht.tap()
        let classDate = app.staticTexts["classDate.title"]
        XCTAssertTrue(classDate.waitUntilExists(timeout: timeout), "a block opens TD-03: \(log)")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        control.buttons[catalog["myDay.app.scopeMine"]].tap()
        let mark = app.buttons["today.row.\(StubPersonalRoutes.mark)"]
        XCTAssertTrue(mark.waitUntilExists(timeout: timeout), "Mijn dag again")
        XCTAssertFalse(app.staticTexts["today.studio.head"].exists)
    }

    /// F068 (#1604): the word is changed on the web while Fivvi Pro is in the background; when the person comes back,
    /// the account is read again and the studio's day, still open, says the new word, on the same day (no new read of it
    /// is needed for that, and the control stays on *Hele studio*).
    func test_F068_theStudioDayFollowsTheWordWhenTheWorkspacesWordChanges() throws {
        let (app, server) = try launch()
        let control = app.segmentedControls["today.scope"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), log)
        control.buttons[catalog["myDay.app.scopeStudio"]].tap()
        let line = app.staticTexts["today.scope.line"]
        XCTAssertTrue(line.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(line.label, String(format: catalog["myDay.app.studioLine"], words, "John's Gym"))

        server.trainerWord = "instructeur"
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: timeout))

        let plural = catalog["trainerWord.instructeur.words"]
        let expected = String(format: catalog["myDay.app.studioLine"], plural, "John's Gym")
        let follows = Polling.until(timeout: timeout, interval: 0.3) { line.exists && line.label == expected }
        XCTAssertTrue(follows, "the line says the new word: \(line.label)\n\(log)")
        XCTAssertEqual(
            app.staticTexts["today.studio.head"].label,
            String(format: catalog["myDay.app.studioTrainersMany"], "3", plural)
        )
    }

    func test_F014_AC11_aTrainerHasNoControl() throws {
        let (app, _) = try launch(role: "trainer", name: "Sarah de Boer")

        XCTAssertTrue(app.staticTexts["today.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(app.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        XCTAssertFalse(app.segmentedControls["today.scope"].exists, "Sarah, a Trainer of John's Gym")
        XCTAssertFalse(app.staticTexts["today.scope.line"].exists)
    }

    func test_F014_AC11_aSoloOwnerHasNoControlAndNoStudioView() throws {
        let (app, server) = try launch(hasTeam: false)

        XCTAssertTrue(app.staticTexts["today.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(app.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        XCTAssertFalse(app.segmentedControls["today.scope"].exists, "no studio view without a team")
        XCTAssertTrue(app.staticTexts[String(format: catalog["myDay.app.summary"], 4, "0", "09:00", "19:00")].exists)
        XCTAssertFalse(
            server.requests.contains { $0.path.hasSuffix("/day") && $0.path.contains("/workspaces/") },
            "the workspace's day is never asked for\n\(log)"
        )
    }
}
