import XCTest

/// *Klanten* / *Clients*, *Klantprofiel* and *+ Nieuwe klant* (F006 AC1 to AC3, AC6, AC7, AC12), in nl and en: the list
/// and its search, quick add with a name only, the offer of an existing client for a duplicate email address, and the
/// overview with its edit. The stub server starts with Anna de Vries, Mark Jansen and Sophie Bakker (synthetic).
@MainActor
final class ClientsUITests: SignInUITestCase {
    private let clientsPath = "/api/v1/workspaces/7c1d2e3f-0000-4000-8000-000000000000/clients"

    /// Sarah (synthetic): Trainer of John's Gym.
    private func launchAsSarah() throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        return (SignInScreen.launch(against: server, session: .signedIn), server)
    }

    /// The row of the client called `name`: its label starts with the name, then the email address.
    private func row(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(
            NSPredicate(format: "identifier == 'clients.row' AND label BEGINSWITH %@", name)
        ).firstMatch
    }

    private func openClients(_ screen: SignInScreen) {
        let open = screen.app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        open.tap()
    }

    /// Replaces what a text field holds.
    private func replaceText(in field: XCUIElement, with text: String) {
        field.tap()
        let current = (field.value as? String) ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count) + text)
    }

    func test_F006_AC12_listSearchAddEdit() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        let open = app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertEqual(open.label, catalog["clients.title"])
        try assertTouchTarget(open, on: screen)
        open.tap()

        // The list: every client of the workspace, with the email address when there is one.
        XCTAssertTrue(row("Anna de Vries", in: app).waitUntilExists(timeout: timeout))
        XCTAssertTrue(row("Mark Jansen", in: app).exists)
        XCTAssertTrue(row("Sophie Bakker", in: app).exists)
        XCTAssertEqual(row("Anna de Vries", in: app).label, "Anna de Vries, anna@example.com")
        XCTAssertEqual(server.requests(to: clientsPath).first?.authorization, "Bearer stub-session-token")

        // Search: part of a name, whatever the case.
        let search = app.searchFields.firstMatch
        search.tap()
        search.typeText("VRIE")
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { !row("Mark Jansen", in: app).exists })
        XCTAssertTrue(row("Anna de Vries", in: app).exists)
        XCTAssertFalse(row("Sophie Bakker", in: app).exists)

        // The profile: name, email address and language for emails.
        row("Anna de Vries", in: app).tap()
        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries")
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, "anna@example.com")
        XCTAssertEqual(app.staticTexts["clientProfile.locale"].label, catalog["clients.addDialog.localeEn"])
        XCTAssertTrue(app.staticTexts["clientProfile.overview"].exists)

        // Edit: the change shows in the overview and on the list.
        app.buttons["clientProfile.edit"].tap()
        let name = app.textFields["clientForm.name"]
        XCTAssertTrue(name.waitUntilExists(timeout: timeout))
        replaceText(in: name, with: "Anna de Vries-Smit")
        app.buttons["clientForm.submit"].tap()
        XCTAssertTrue(app.staticTexts["clientProfile.saved"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries-Smit")
        XCTAssertEqual(app.staticTexts["clientProfile.saved"].label, catalog["clients.profile.saved"])
        XCTAssertTrue(server.requests.contains { $0.method == "PATCH" && $0.body == ["name": "Anna de Vries-Smit"] })
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(row("Anna de Vries-Smit", in: app).waitUntilExists(timeout: timeout))
    }

    func test_F006_AC1_aNameAloneAddsAClientAndOpensTheProfile() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        let add = app.buttons["clients.new"]
        XCTAssertTrue(add.waitUntilExists(timeout: timeout))
        // The system draws a bar button 36 pt high; its hit area is the system's, so no touch-target check here.
        XCTAssertEqual(add.label, catalog["clients.newClient"])

        add.tap()
        let name = app.textFields["clientForm.name"]
        XCTAssertTrue(name.waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.buttons["clientForm.submit"].label, catalog["clients.addDialog.submit"])
        XCTAssertEqual(
            app.buttons["clientForm.locale.default"].label,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"]),
            "Standaard (Nederlands) is offered first"
        )
        XCTAssertTrue(app.buttons["clientForm.locale.default"].isSelected, "and preselected")
        name.typeText("Bram Visser")
        app.buttons["clientForm.submit"].tap()

        let added = app.staticTexts["clientProfile.added"]
        XCTAssertTrue(added.waitUntilExists(timeout: timeout))
        XCTAssertEqual(added.label, String(format: catalog["clients.profile.added"], "Bram Visser"))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Bram Visser")
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, catalog["clients.profile.noEmail"])
        XCTAssertEqual(
            app.staticTexts["clientProfile.locale"].label,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"])
        )
        let posts = server.requests.filter { $0.method == "POST" && $0.path == clientsPath }
        let sent = [["name": "Bram Visser", "surface": "ios"]]
        XCTAssertEqual(posts.map(\.body), sent, "a name alone, from the iPhone app")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(row("Bram Visser", in: app).waitUntilExists(timeout: timeout))
    }

    func test_F006_AC3_anExistingEmailAddressOffersThatClientAndAddsNoSecondOne() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        app.buttons["clients.new"].tap()
        XCTAssertTrue(app.textFields["clientForm.name"].waitUntilExists(timeout: timeout))
        screen.type("Anna de Vries-Smit", into: app.textFields["clientForm.name"])
        screen.type("ANNA@example.com", into: app.textFields["clientForm.email"])
        app.buttons["clientForm.submit"].tap()

        let exists = app.staticTexts["clientForm.exists"]
        XCTAssertTrue(exists.waitUntilExists(timeout: timeout))
        XCTAssertEqual(exists.label, String(format: catalog["clients.addDialog.exists"], "Anna de Vries"))
        XCTAssertEqual(
            app.buttons["clientForm.openExisting"].label,
            String(format: catalog["clients.addDialog.openExisting"], "Anna de Vries")
        )
        XCTAssertEqual(app.buttons["clientForm.otherEmail"].label, catalog["clients.addDialog.otherEmail"])

        app.buttons["clientForm.openExisting"].tap()

        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries")
        XCTAssertFalse(app.staticTexts["clientProfile.added"].exists)
        let posts = server.requests.filter { $0.method == "POST" && $0.path == clientsPath }
        XCTAssertEqual(posts.count, 1)
    }

    func test_F006_AC2_aMissingNameAndAnInvalidEmailAddressAreRefusedWithAFieldMessage() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        app.buttons["clients.new"].tap()
        XCTAssertTrue(app.buttons["clientForm.submit"].waitUntilExists(timeout: timeout))

        app.buttons["clientForm.submit"].tap()
        let nameError = app.staticTexts["clientForm.nameError"]
        XCTAssertTrue(nameError.waitUntilExists(timeout: timeout))
        XCTAssertEqual(nameError.label, catalog["clients.addDialog.errors.nameRequired"])

        screen.type("Eva Smit", into: app.textFields["clientForm.name"])
        screen.type("not-an-address", into: app.textFields["clientForm.email"])
        app.buttons["clientForm.submit"].tap()
        let emailError = app.staticTexts["clientForm.emailError"]
        XCTAssertTrue(emailError.waitUntilExists(timeout: timeout))
        XCTAssertEqual(emailError.label, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertFalse(app.staticTexts["clientForm.nameError"].exists)
        XCTAssertTrue(server.requests.filter { $0.method == "POST" }.isEmpty, "nothing is sent")
    }

    func test_F006_AC12_aFailedLoadShowsTheErrorAndRetryRecovers() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let open = screen.app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        server.setOffline(true)
        open.tap()

        let error = screen.app.staticTexts["clients.error"]
        XCTAssertTrue(error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(error.label, catalog["clients.loadError"])
        server.setOffline(false)
        screen.app.buttons["clients.retry"].tap()

        XCTAssertTrue(row("Anna de Vries", in: screen.app).waitUntilExists(timeout: timeout))
        XCTAssertFalse(error.exists)
    }
}
