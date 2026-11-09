import XCTest

/// *Klanten* / *Clients*, *Klantprofiel* and *+ Nieuwe klant* (F006 AC1 to AC3, AC6, AC7, AC12), in nl and en: the list
/// and its search, quick add with a name and an email address, the offer of an existing client for a duplicate email
/// address, and the overview with its edit. The stub server starts with Anna de Vries, Mark Jansen and Sophie Bakker
/// (synthetic).
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

    /// An account whose capabilities include `clients.view` but not `clients.manage` (the matrix has no such role yet).
    private func launchAsViewer(hasNoClients: Bool = false) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "viewer@example.com", workspaceName: "John's Gym", role: "trainer",
                capabilities: ["trainers.view", "clients.view"], hasNoClients: hasNoClients
            )
        )
        return (SignInScreen.launch(against: server, session: .signedIn), server)
    }

    /// The row of the client called `name`: `clients.row.<id>`, its label starts with the name, then the email address.
    private func row(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH %@", name)
        ).firstMatch
    }

    private func openClients(_ screen: SignInScreen) {
        let open = screen.app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertTrue(open.tap(until: screen.app.descendants(matching: .any)["clients.list"], timeout: timeout))
    }

    /// Replaces what a text field holds.
    private func replaceText(in field: XCUIElement, with text: String) {
        field.focus()
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

        // The list: every client of the workspace, with its email address.
        XCTAssertTrue(open.tap(until: row("Anna de Vries", in: app), timeout: timeout))
        XCTAssertTrue(row("Mark Jansen", in: app).exists)
        XCTAssertTrue(row("Sophie Bakker", in: app).exists)
        XCTAssertEqual(row("Anna de Vries", in: app).label, "Anna de Vries, anna@example.com")
        XCTAssertEqual(server.requests(to: clientsPath).first?.authorization, "Bearer stub-session-token")

        XCTAssertTrue(app.descendants(matching: .any)["clients.list"].exists, "the list has the id Maestro looks for")
        let anyElement = { (prefix: String) in
            app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch
        }
        XCTAssertTrue(anyElement("clients.rowName.").exists, "the name of a row has its id")
        XCTAssertTrue(anyElement("clients.rowEmail.").exists, "and so has the email address")

        // Search: part of a name, whatever the case.
        let search = app.searchFields["clients.search"]
        XCTAssertTrue(search.exists, "the search field has the id Maestro looks for")
        search.focus()
        search.typeText("VRIE")
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { !row("Mark Jansen", in: app).exists })
        XCTAssertTrue(row("Anna de Vries", in: app).exists)
        XCTAssertFalse(row("Sophie Bakker", in: app).exists)

        // The profile: name, email address and language for emails.
        row("Anna de Vries", in: app).tap()
        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries")
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, "anna@example.com")
        XCTAssertEqual(app.staticTexts["clientProfile.language"].label, catalog["clients.addDialog.localeEn"])
        XCTAssertTrue(app.staticTexts["clientProfile.overview"].exists)

        // Edit: the change shows in the overview and on the list.
        app.buttons["clientProfile.edit"].tap()
        let name = app.textFields["clientProfile.edit.name"]
        XCTAssertTrue(name.waitUntilExists(timeout: timeout))
        replaceText(in: name, with: "Anna de Vries-Smit")
        app.buttons["clientProfile.edit.save"].tap()
        XCTAssertTrue(app.staticTexts["clientProfile.saved"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries-Smit")
        XCTAssertEqual(app.staticTexts["clientProfile.saved"].label, catalog["clients.profile.saved"])
        XCTAssertTrue(server.requests.contains { $0.method == "PATCH" && $0.body == ["name": "Anna de Vries-Smit"] })
        app.buttons["clientProfile.back"].tap()
        XCTAssertTrue(row("Anna de Vries-Smit", in: app).waitUntilExists(timeout: timeout))
    }

    func test_F006_AC1_aNameAndAnEmailAddressAddAClientAndOpenTheProfile() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        let add = app.buttons["clients.add"]
        XCTAssertTrue(add.waitUntilExists(timeout: timeout))
        try assertTouchTarget(add, on: screen)
        XCTAssertEqual(add.label, catalog["clients.newClient"])

        add.tap()
        let name = app.textFields["clients.add.name"]
        XCTAssertTrue(name.waitUntilExists(timeout: timeout))
        XCTAssertTrue(
            Polling.until(timeout: timeout) { name.hasKeyboardFocus }, "the name field has focus when the dialog opens"
        )
        XCTAssertEqual(app.buttons["clients.add.submit"].label, catalog["clients.addDialog.submit"])
        XCTAssertEqual(
            app.buttons["clients.add.language.default"].label,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"]),
            "Standaard (Nederlands) is offered first"
        )
        XCTAssertTrue(app.buttons["clients.add.language.default"].isSelected, "and preselected")
        name.typeText("Bram Visser")
        screen.type("bram@example.com", into: app.textFields["clients.add.email"])
        app.buttons["clients.add.submit"].tap()

        let added = app.staticTexts["clientProfile.added"]
        XCTAssertTrue(added.waitUntilExists(timeout: timeout))
        XCTAssertEqual(added.label, String(format: catalog["clients.profile.added"], "Bram Visser"))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Bram Visser")
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, "bram@example.com")
        XCTAssertEqual(
            app.staticTexts["clientProfile.language"].label,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"])
        )
        let posts = server.requests.filter { $0.method == "POST" && $0.path == clientsPath }
        let sent = [["name": "Bram Visser", "email": "bram@example.com", "surface": "ios"]]
        XCTAssertEqual(posts.map(\.body), sent, "a name and an email address, from the iPhone app")
        app.buttons["clientProfile.back"].tap()
        XCTAssertTrue(row("Bram Visser", in: app).waitUntilExists(timeout: timeout))
    }

    func test_F006_AC3_anExistingEmailAddressOffersThatClientAndAddsNoSecondOne() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        app.buttons["clients.add"].tap()
        XCTAssertTrue(app.textFields["clients.add.name"].waitUntilExists(timeout: timeout))
        screen.type("Anna de Vries-Smit", into: app.textFields["clients.add.name"])
        screen.type("ANNA@example.com", into: app.textFields["clients.add.email"])
        app.buttons["clients.add.submit"].tap()

        let exists = app.staticTexts["clients.add.duplicate"]
        XCTAssertTrue(exists.waitUntilExists(timeout: timeout))
        XCTAssertEqual(exists.label, String(format: catalog["clients.addDialog.exists"], "Anna de Vries"))
        XCTAssertEqual(
            app.buttons["clients.add.openExisting"].label,
            String(format: catalog["clients.addDialog.openExisting"], "Anna de Vries")
        )
        XCTAssertEqual(app.buttons["clients.add.otherEmail"].label, catalog["clients.addDialog.otherEmail"])

        app.buttons["clients.add.openExisting"].tap()

        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries")
        XCTAssertFalse(app.staticTexts["clientProfile.added"].exists)
        let posts = server.requests.filter { $0.method == "POST" && $0.path == clientsPath }
        XCTAssertEqual(posts.count, 1)
    }

    func test_F006_AC2_aMissingNameAndAMissingOrInvalidEmailAddressAreRefusedWithAFieldMessage() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        app.buttons["clients.add"].tap()
        XCTAssertTrue(app.buttons["clients.add.submit"].waitUntilExists(timeout: timeout))

        app.buttons["clients.add.submit"].tap()
        let nameError = app.staticTexts["clients.add.nameError"]
        XCTAssertTrue(nameError.waitUntilExists(timeout: timeout))
        XCTAssertEqual(nameError.label, catalog["clients.addDialog.errors.nameRequired"])

        screen.type("Eva Smit", into: app.textFields["clients.add.name"])
        app.buttons["clients.add.submit"].tap()
        let missing = app.staticTexts["clients.add.emailError"]
        XCTAssertTrue(missing.waitUntilExists(timeout: timeout), "a name alone is not enough")
        XCTAssertEqual(missing.label, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertFalse(app.staticTexts["clients.add.nameError"].exists)

        screen.type("not-an-address", into: app.textFields["clients.add.email"])
        app.buttons["clients.add.submit"].tap()
        let emailError = app.staticTexts["clients.add.emailError"]
        XCTAssertTrue(emailError.waitUntilExists(timeout: timeout))
        XCTAssertEqual(emailError.label, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertFalse(app.staticTexts["clients.add.nameError"].exists)
        XCTAssertTrue(server.requests.filter { $0.method == "POST" }.isEmpty, "nothing is sent")
    }

    func test_F006_AC7_anEmailAddressOfAnotherClientOffersThatClientOnEditToo() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        XCTAssertTrue(row("Mark Jansen", in: app).waitUntilExists(timeout: timeout))
        row("Mark Jansen", in: app).tap()
        XCTAssertTrue(app.buttons["clientProfile.edit"].waitUntilExists(timeout: timeout))
        app.buttons["clientProfile.edit"].tap()
        XCTAssertEqual(app.staticTexts["clientProfile.edit.title"].label, catalog["clients.profile.editTitle"])
        replaceText(in: app.textFields["clientProfile.edit.email"], with: "Anna@Example.com")
        app.buttons["clientProfile.edit.save"].tap()

        let duplicate = app.staticTexts["clientProfile.edit.duplicate"]
        XCTAssertTrue(duplicate.waitUntilExists(timeout: timeout))
        XCTAssertEqual(duplicate.label, String(format: catalog["clients.addDialog.exists"], "Anna de Vries"))
        let open = app.buttons["clientProfile.edit.openExisting"]
        XCTAssertEqual(open.label, String(format: catalog["clients.addDialog.openExisting"], "Anna de Vries"))
        XCTAssertTrue(app.buttons["clientProfile.edit.otherEmail"].exists)
        open.tap()

        let name = app.staticTexts["clientProfile.name"]
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { name.exists && name.label == "Anna de Vries" })
        XCTAssertFalse(app.textFields["clientProfile.edit.name"].exists, "the sheet is gone")
        XCTAssertEqual(app.staticTexts["clientProfile.title"].label, "Anna de Vries")
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, "anna@example.com")
        XCTAssertTrue(server.requests.contains { $0.method == "PATCH" && $0.body == ["email": "Anna@Example.com"] })
        app.buttons["clientProfile.back"].tap()
        XCTAssertTrue(row("Mark Jansen", in: app).waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.staticTexts["clientProfile.name"].exists, "back goes to the list")
    }

    func test_F006_AC7_anEmptiedEmailAddressIsRefusedAndTheClientKeepsIt() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        XCTAssertTrue(row("Anna de Vries", in: app).waitUntilExists(timeout: timeout))
        row("Anna de Vries", in: app).tap()
        XCTAssertTrue(app.buttons["clientProfile.edit"].waitUntilExists(timeout: timeout))
        app.buttons["clientProfile.edit"].tap()
        replaceText(in: app.textFields["clientProfile.edit.email"], with: "")
        app.buttons["clientProfile.edit.save"].tap()

        let emailError = app.staticTexts["clientProfile.edit.emailError"]
        XCTAssertTrue(emailError.waitUntilExists(timeout: timeout))
        XCTAssertEqual(emailError.label, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertTrue(server.requests.filter { $0.method == "PATCH" }.isEmpty, "nothing is sent")
        app.buttons["clientProfile.edit.close"].tap()
        XCTAssertEqual(app.staticTexts["clientProfile.email"].label, "anna@example.com")
    }

    func test_F004_AC10_withoutClientsManageNoAddOrEditActionShows() throws {
        let (screen, server) = try launchAsViewer()
        let app = screen.app
        openClients(screen)

        XCTAssertTrue(row("Anna de Vries", in: app).waitUntilExists(timeout: timeout), "they may still see the clients")
        XCTAssertFalse(app.buttons["clients.add"].exists, "no + Nieuwe klant")
        row("Anna de Vries", in: app).tap()
        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.buttons["clientProfile.edit"].exists, "no Bewerken on the profile")
        withExtendedLifetime(server) {}
    }

    func test_F004_AC10_withoutClientsManageTheEmptyStateOffersNoAddAction() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsViewer(hasNoClients: true)
        openClients(screen)

        let empty = screen.app.staticTexts["clients.empty"]
        XCTAssertTrue(empty.waitUntilExists(timeout: timeout))
        XCTAssertEqual(empty.label, catalog["clients.empty"])
        XCTAssertFalse(screen.app.buttons["clients.add"].exists)
        withExtendedLifetime(server) {}
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
