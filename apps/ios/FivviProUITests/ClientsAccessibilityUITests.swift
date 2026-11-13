import XCTest

/// E020 AC15: the accessibility audit, with the contrast check, of *Klanten*, *Klantprofiel* and the sheets *Nieuwe
/// klant* and *Bewerken*, in light and dark (nl and en come from the test plan's two configurations). The contrast
/// check accepts only the secondary text token (`auditWithContrast`); the sheets' system bar buttons and title are
/// exempt for the issues listed there.
@MainActor
final class ClientsAccessibilityUITests: SignInUITestCase {
    private let modes: [(String, UIUserInterfaceStyle)] = [("light", .light), ("dark", .dark)]

    private func launchAsSarah(appearance: String) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let app = AppLaunch.launch(against: server, session: .signedIn, appearance: appearance)
        return (SignInScreen(app: app), server)
    }

    private func openClients(_ screen: SignInScreen, _ mode: String) {
        let open = screen.app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), mode)
        XCTAssertTrue(open.tap(until: screen.app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.'")
        ).firstMatch, timeout: timeout), mode)
    }

    func test_E020_AC15_klantenPassesTheAccessibilityAuditInLightAndDark() throws {
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            openClients(screen, mode)
            screen.settle(screen.app.buttons["clients.add"])
            // The email addresses are one long word each: ClientsLookUITests shows them wrapping at the largest size.
            try auditWithContrast(
                screen.app, style: style, "Klanten, \(mode)", wrappingTextPrefixes: ["clients.rowEmail."]
            )
            withExtendedLifetime(server) {}
            screen.app.terminate()
        }
    }

    func test_E020_AC15_klantprofielPassesTheAccessibilityAuditInLightAndDark() throws {
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            let app = screen.app
            openClients(screen, mode)
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH 'Anna'")
            ).firstMatch.tap()
            XCTAssertTrue(app.staticTexts["clientProfile.email"].waitUntilExists(timeout: timeout), mode)
            screen.settle(app.staticTexts["clientProfile.email"])
            // The bar's back button (ours, so its id is on the button and its text) and *Bewerken* are the bar's: the
            // system sets their size and glass, as for the sheets' bar items.
            try auditWithContrast(
                app, style: style, "Klantprofiel, \(mode)",
                systemBarItems: ["clientProfile.back", "clientProfile.backTitle", "clientProfile.edit"]
            )
            withExtendedLifetime(server) {}
            app.terminate()
        }
    }

    func test_E020_AC15_theFormsWithTheirErrorsPassTheAccessibilityAuditInLightAndDark() throws {
        let barItems: (String) -> Set<String> = { ["\($0).close", "\($0).submit", "\($0).save", "\($0).title"] }
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            let app = screen.app
            openClients(screen, mode)

            // Nieuwe klant, with the message of a missing name.
            app.buttons["clients.add"].tap()
            let name = app.textFields["clients.add.name"]
            XCTAssertTrue(name.waitUntilExists(timeout: timeout), mode)
            app.buttons["clients.add.submit"].tap()
            let message = TestCatalog.configured["clients.addDialog.errors.nameRequired"]
            XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { name.label.hasSuffix(message) }, mode)
            screen.settle(name)
            try auditWithContrast(
                app, style: style, "Nieuwe klant with its error, \(mode)",
                systemBarItems: barItems("clients.add"), systemBarTitle: "clients.add.title"
            )
            app.buttons["clients.add.close"].tap()

            // Bewerken of a client, with the message of an emptied address.
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH 'Anna'")
            ).firstMatch.tap()
            XCTAssertTrue(app.buttons["clientProfile.edit"].waitUntilExists(timeout: timeout), mode)
            app.buttons["clientProfile.edit"].tap()
            let email = app.textFields["clientProfile.edit.email"]
            XCTAssertTrue(email.waitUntilExists(timeout: timeout), mode)
            email.focus()
            let current = (email.value as? String) ?? ""
            email.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
            app.buttons["clientProfile.edit.save"].tap()
            let invalid = TestCatalog.configured["clients.addDialog.errors.emailInvalid"]
            XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { email.label.hasSuffix(invalid) }, mode)
            screen.settle(email)
            try auditWithContrast(
                app, style: style, "Bewerken with its error, \(mode)",
                systemBarItems: barItems("clientProfile.edit"), systemBarTitle: "clientProfile.edit.title"
            )
            withExtendedLifetime(server) {}
            app.terminate()
        }
    }
}
