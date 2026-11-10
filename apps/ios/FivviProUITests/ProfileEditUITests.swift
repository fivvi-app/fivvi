import XCTest

/// *Profiel* (TM-04) changes the name and the Owner's switch *I also train here* (F005 AC1, AC4, AC5), in nl and en.
/// Sarah (synthetic) is Trainer of John's Gym (workspace 0) and Owner of Sarah Personal Training (workspace 1).
@MainActor
final class ProfileEditUITests: SignInUITestCase {
    private func launchAsSarah(name: String? = "Sarah") throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
                otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: name
            )
        )
        return (SignInScreen.launch(against: server, session: .signedIn), server)
    }

    private func openProfile(_ screen: SignInScreen) {
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertTrue(open.tap(until: screen.app.staticTexts["profile.workspacesTitle"], timeout: timeout))
    }

    /// Replaces what is in the name field with `text`.
    private func type(_ text: String, replacing field: XCUIElement) {
        field.focus()
        let current = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count) + text)
    }

    private func value(_ element: XCUIElement) -> String? { element.value as? String }

    // MARK: AC1: the name

    func test_F005_AC1_editNameUpdatesProfile() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        XCTAssertEqual(app.staticTexts["profile.detailsTitle"].label, catalog["myProfile.detailsTitle"])
        XCTAssertEqual(app.buttons["profile.name"].label, "Sarah")
        XCTAssertEqual(app.staticTexts["profile.email"].label, "trainer@example.com")
        try assertTouchTarget(app.buttons["profile.name"], on: screen)

        app.buttons["profile.name"].tap()

        let input = app.textFields["profile.nameInput"]
        XCTAssertTrue(input.waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["profile.nameEditor"].label, catalog["myProfile.editName"])
        XCTAssertEqual(app.buttons["profile.nameSave"].label, catalog["myProfile.save"])
        XCTAssertEqual(app.buttons["profile.nameCancel"].label, catalog["common.cancel"])
        XCTAssertEqual(value(input), "Sarah")
        type("Sarah Bakker", replacing: input)
        app.buttons["profile.nameSave"].tap()

        let name = app.buttons["profile.name"]
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { name.exists && name.label == "Sarah Bakker" })
        XCTAssertFalse(input.exists, "the sheet closed once the API accepted")
        XCTAssertEqual(app.staticTexts["profile.nameSaved"].label, catalog["myProfile.saved"])
        XCTAssertEqual(server.name, "Sarah Bakker")
        let patches = server.requests(to: "/api/v1/me").filter { $0.method == "PATCH" }
        XCTAssertEqual(patches.map(\.body["name"]), ["Sarah Bakker"])
        XCTAssertEqual(patches.map(\.authorization), ["Bearer stub-session-token"])

        // Stored on the account, not only kept in the app: a new start shows it, and so does the web on its next load.
        app.terminate()
        let again = SignInScreen.launch(against: server, session: .signedIn)
        openProfile(again)
        XCTAssertEqual(again.app.buttons["profile.name"].label, "Sarah Bakker")
        again.app.terminate() // so the next test starts its own app, against its own stub server
    }

    func test_F005_AC1_cancelLeavesTheNameAsItWas() throws {
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        app.buttons["profile.name"].tap()
        let input = app.textFields["profile.nameInput"]
        XCTAssertTrue(input.waitUntilExists(timeout: timeout))
        type("Someone Else", replacing: input)

        app.buttons["profile.nameCancel"].tap()

        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !input.exists })
        XCTAssertEqual(app.buttons["profile.name"].label, "Sarah")
        XCTAssertEqual(server.requests(to: "/api/v1/me").filter { $0.method == "PATCH" }.count, 0)
    }

    func test_F005_AC1_aRefusedNameShowsTheFieldMessageAndKeepsTheInput() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        app.buttons["profile.name"].tap()
        let input = app.textFields["profile.nameInput"]
        XCTAssertTrue(input.waitUntilExists(timeout: timeout))

        type("   ", replacing: input)
        app.buttons["profile.nameSave"].tap()
        let error = app.staticTexts["profile.nameError"]
        XCTAssertTrue(error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(error.label, catalog["myProfile.errors.nameRequired"])
        XCTAssertEqual(value(input), "   ", "what was typed stays")

        type(String(repeating: "x", count: 81), replacing: input)
        app.buttons["profile.nameSave"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) {
            error.exists && error.label == catalog["myProfile.errors.nameTooLong"]
        })

        server.setOffline(true)
        app.buttons["profile.nameSave"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) {
            error.exists && error.label == catalog["myProfile.errors.noConnection"]
        })
        server.setOffline(false)

        type("Sarah Bakker", replacing: input)
        XCTAssertFalse(error.exists, "typing clears the message")
        app.buttons["profile.nameSave"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { app.buttons["profile.name"].exists })
        XCTAssertEqual(app.buttons["profile.name"].label, "Sarah Bakker")
        XCTAssertEqual(server.name, "Sarah Bakker")
    }

    func test_F005_AC1_withoutANameTheRowOffersTheChange() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah(name: nil)
        openProfile(screen)

        XCTAssertEqual(screen.app.buttons["profile.name"].label, catalog["myProfile.editName"])
        XCTAssertNil(server.name)
    }

    // MARK: AC5, AC4: the Owner's switch

    func test_F005_AC5_noSwitchWhereThePersonIsTrainer() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)

        let own = app.switches["profile.trainsHere.workspace-1"]
        XCTAssertTrue(own.waitUntilExists(timeout: timeout), "the Owner's workspace has the switch")
        XCTAssertEqual(
            own.label, String(format: catalog["profile.trainsHere.label"], "Sarah Personal Training"),
            "worded as training, naming the workspace"
        )
        XCTAssertTrue(app.staticTexts["profile.workspaceName.workspace-0"].exists)
        XCTAssertFalse(app.switches["profile.trainsHere.workspace-0"].exists, "none where the person is Trainer")
        // The whole row is the control (label and switch), so a tap anywhere on it moves the switch: 44 pt at least.
        try assertTouchTarget(own, on: screen)
        XCTAssertTrue(server.requests.filter { $0.path.hasSuffix("/trainer-profile") }.isEmpty)
    }

    func test_F005_AC4_anOwnerSwitchesTrainingOnAndOff() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        let own = app.switches["profile.trainsHere.workspace-1"]
        XCTAssertTrue(own.waitUntilExists(timeout: timeout))
        XCTAssertEqual(value(own), "0")

        own.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { value(own) == "1" })
        let saved = app.staticTexts["profile.trainsHereSaved.workspace-1"]
        XCTAssertEqual(saved.label, catalog["profile.trainsHere.saved"])
        XCTAssertTrue(server.trainsHere(workspace: 1))

        own.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { value(own) == "0" })
        XCTAssertFalse(server.trainsHere(workspace: 1))

        // The control itself moves it too, with one call (not one for the control and one for the row).
        own.switches.firstMatch.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { value(own) == "1" })
        let calls = server.requests.filter { $0.path.hasSuffix("/trainer-profile") }.map(\.method)
        XCTAssertEqual(calls, ["PUT", "DELETE", "PUT"])
        let target = "/api/v1/workspaces/7c1d2e3f-0000-4000-8000-000000000001/trainer-profile"
        XCTAssertTrue(server.requests.contains { $0.path == target })
    }

    func test_F005_AC4_theSwitchWaitsForTheApiAndBackDoesNothingMeanwhile() throws {
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        let own = app.switches["profile.trainsHere.workspace-1"]
        XCTAssertTrue(own.waitUntilExists(timeout: timeout))
        server.holdTrainerProfileRequests(true)

        own.tap()

        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !own.isEnabled }, "saving: no second tap")
        XCTAssertEqual(value(own), "0", "the switch moves only when the API accepted")
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
        edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        XCTAssertTrue(app.staticTexts["profile.workspacesTitle"].exists, "back does nothing while a save is under way")
        XCTAssertFalse(app.buttons["home.openProfile"].exists)

        server.holdTrainerProfileRequests(false)
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { value(own) == "1" && own.isEnabled })
    }

    func test_F005_AC4_aFailedSaveLeavesTheSwitchWithAMessage() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        let own = app.switches["profile.trainsHere.workspace-1"]
        XCTAssertTrue(own.waitUntilExists(timeout: timeout))
        let error = app.staticTexts["profile.trainsHereError.workspace-1"]

        server.answerTrainerProfile(withStatus: 500)
        own.tap()
        XCTAssertTrue(error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(error.label, catalog["profile.trainsHere.errors.generic"])
        XCTAssertEqual(value(own), "0")

        server.setOffline(true)
        own.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) {
            error.exists && error.label == catalog["profile.trainsHere.errors.noConnection"]
        })
        XCTAssertEqual(value(own), "0")
        server.setOffline(false)

        server.answerTrainerProfile(withStatus: nil)
        own.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { value(own) == "1" })
        XCTAssertFalse(error.exists)
    }
}
