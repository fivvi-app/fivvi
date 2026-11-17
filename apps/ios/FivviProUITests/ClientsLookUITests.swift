import FivviDesignTokens
import XCTest

/// E020 AC15, the look of *Klanten* (TM-02), *Klantprofiel* (TM-03) and *Nieuwe klant* (TD-05) against their prototype
/// entries, in light and dark, nl and en: the clients as avatar rows in one rounded group on the grouped canvas, the
/// add button in the bar, the profile's centred avatar and name over the grouped overview with its values at the end,
/// and the form's fields in groups, a field with its error turning red. The stub server starts with Anna de Vries,
/// Mark Jansen and Sophie Bakker (synthetic).
@MainActor
final class ClientsLookUITests: SignInUITestCase {
    private let gutter: CGFloat = 16
    private let modes: [(String, UIUserInterfaceStyle)] = [("light", .light), ("dark", .dark)]

    private func launchAsSarah(appearance: String) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let screen = SignInScreen(app: AppLaunch.launch(against: server, session: .signedIn, appearance: appearance))
        return (screen, server)
    }

    private func openClients(_ screen: SignInScreen, _ mode: String) {
        let open = screen.app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), mode)
        XCTAssertTrue(open.tap(until: screen.app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.'")
        ).firstMatch, timeout: timeout), mode)
    }

    private func rows(_ app: XCUIApplication) -> [XCUIElement] {
        let query = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'clients.row.'"))
        return (0 ..< query.count).map { query.element(boundBy: $0) }
    }

    /// The share of the points of a column, from `top` to `bottom` (points), whose colour is within `tolerance` of one of
    /// `colours`.
    private func share(
        of colours: ScreenColours, column: CGFloat, from top: CGFloat, to bottom: CGFloat, near wanted: [RGB],
        tolerance: Int = 24
    ) -> Int {
        stride(from: top, to: bottom, by: 1).filter { row in
            let found = colours.colour(at: CGPoint(x: column, y: row))
            return wanted.contains { found.distance(to: $0) <= tolerance }
        }.count
    }

    func test_E020_AC15_klantenIsOneRoundedGroupOfAvatarRowsWithTheAddButtonInTheBar() throws {
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            let app = screen.app
            openClients(screen, mode)
            let all = rows(app)
            XCTAssertEqual(all.count, 3, mode)
            let window = app.windows.firstMatch.frame
            screen.settle(all[0])
            let colours = try ScreenColours(app)
            let card = RGB(Tokens.Colors.bgSurface, in: style)
            let canvas = RGB(Tokens.Colors.bgCanvas, in: style)

            // One group in the gutters: the rows are as wide as the window less a gutter on each side, one under the other.
            for row in all {
                XCTAssertEqual(row.frame.minX, gutter, accuracy: 1, "\(row.label), \(mode)")
                XCTAssertEqual(row.frame.width, window.width - 2 * gutter, accuracy: 1, "\(row.label), \(mode)")
                XCTAssertGreaterThanOrEqual(row.frame.height, 52, "a row is at least 52 pt high, \(mode)")
            }
            XCTAssertEqual(all[1].frame.minY, all[0].frame.maxY, accuracy: 1.5, "the rows touch, \(mode)")
            let middle = all[1].frame
            XCTAssertLessThanOrEqual(
                colours.colour(at: CGPoint(x: middle.midX, y: middle.minY + 3)).distance(to: card), 6, "card, \(mode)"
            )
            XCTAssertLessThanOrEqual(
                colours.colour(at: CGPoint(x: gutter / 2, y: middle.midY)).distance(to: canvas), 6, "canvas, \(mode)"
            )

            // The avatar: a 40 pt circle in the private gradient, its centre 16 pt in from the group's edge and 36 pt
            // from the row's start.
            let avatarGradient = [
                RGB(Tokens.Colors.sessionPrivateGradientTop, in: style),
                RGB(Tokens.Colors.sessionPrivateGradientBottom, in: style)
            ]
            let first = all[0].frame
            let avatarX = first.minX + 16 + 20
            XCTAssertGreaterThanOrEqual(
                share(of: colours, column: avatarX, from: first.midY - 20, to: first.midY + 20, near: avatarGradient),
                30, "a 40 pt avatar in the private gradient, \(mode)"
            )
            XCTAssertEqual(
                share(of: colours, column: first.minX + 16 - 3, from: first.midY - 20, to: first.midY + 20,
                      near: avatarGradient), 0, "nothing of it left of its edge, \(mode)"
            )

            // The name starts after the avatar, the email address under it.
            let name = app.staticTexts.matching(
                NSPredicate(format: "identifier BEGINSWITH 'clients.rowName.' AND label == 'Anna de Vries'")
            ).firstMatch
            XCTAssertTrue(name.exists, mode)
            XCTAssertGreaterThanOrEqual(name.frame.minX, first.minX + 16 + 40 + 8, "after the avatar, \(mode)")

            // The add button is in the navigation bar, not floating over the list.
            let add = app.navigationBars.buttons["clients.add"]
            XCTAssertTrue(add.exists, "the add button is in the bar, \(mode)")
            XCTAssertEqual(add.label, TestCatalog.configured["clients.newClient"])
            withExtendedLifetime(server) {}
            app.terminate()
        }
    }

    func test_E020_AC15_klantprofielCentresTheAvatarAndNameOverTheGroupedOverview() throws {
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            let app = screen.app
            openClients(screen, mode)
            rows(app)[0].tap()
            let title = app.staticTexts["clientProfile.title"]
            XCTAssertTrue(title.waitUntilExists(timeout: timeout), mode)
            XCTAssertEqual(title.label, "Anna de Vries")
            XCTAssertTrue(try title.hasTrait(.header), mode)
            screen.settle(title)
            let window = app.windows.firstMatch.frame
            XCTAssertEqual(title.frame.midX, window.midX, accuracy: 2, "the name is centred, \(mode)")

            // The 84 pt avatar sits above the name, centred.
            let colours = try ScreenColours(app)
            let gradient = [
                RGB(Tokens.Colors.sessionPrivateGradientTop, in: style),
                RGB(Tokens.Colors.sessionPrivateGradientBottom, in: style)
            ]
            XCTAssertGreaterThanOrEqual(
                share(of: colours, column: window.midX, from: title.frame.minY - 110, to: title.frame.minY,
                      near: gradient),
                60, "an 84 pt avatar above the name, \(mode)"
            )

            // The overview is a group: the labels at the start, the values at the end of their rows.
            let group = RGB(Tokens.Colors.bgSurface, in: style)
            for (id, label) in [("clientProfile.name", "Anna de Vries"), ("clientProfile.email", "anna@example.com")] {
                let value = app.staticTexts[id]
                XCTAssertTrue(value.waitUntilExists(timeout: timeout), "\(id), \(mode)")
                XCTAssertEqual(value.label, label, mode)
                let end = window.maxX - gutter - 16
                XCTAssertGreaterThanOrEqual(value.frame.maxX, end - 2, "\(id) at the end, \(mode)")
                XCTAssertLessThanOrEqual(value.frame.maxX, end + 1, "\(id) inside the row, \(mode)")
                XCTAssertLessThanOrEqual(
                    colours.colour(at: CGPoint(x: gutter + 3, y: value.frame.midY)).distance(to: group), 6,
                    "\(id) is in the card, \(mode)"
                )
            }
            XCTAssertGreaterThan(
                app.staticTexts["clientProfile.overview"].frame.minY, title.frame.maxY, "the overview is under the name"
            )
            withExtendedLifetime(server) {}
            app.terminate()
        }
    }

    func test_E020_AC15_nieuweKlantHasItsFieldsInGroupsAndAFieldWithAnErrorTurnsRed() throws {
        let catalog = TestCatalog.configured
        for (mode, style) in modes {
            let (screen, server) = try launchAsSarah(appearance: mode)
            let app = screen.app
            openClients(screen, mode)
            app.buttons["clients.add"].tap()
            let name = app.textFields["clients.add.name"]
            XCTAssertTrue(name.waitUntilExists(timeout: timeout), mode)
            let window = app.windows.firstMatch.frame
            screen.settle(name)

            // The name and the email address are fields of one group, the language a group of its own.
            let email = app.textFields["clients.add.email"]
            XCTAssertLessThan(name.frame.maxY, email.frame.minY, mode)
            XCTAssertGreaterThanOrEqual(name.frame.minX, gutter + 16 - 1, "the field is inset in its group, \(mode)")
            XCTAssertLessThanOrEqual(name.frame.maxX, window.maxX - gutter - 16 + 1, mode)
            let language = app.buttons["clients.add.language.default"]
            XCTAssertEqual(language.frame.minX, gutter, accuracy: 1, "the language rows are a group, \(mode)")
            XCTAssertEqual(language.frame.width, window.width - 2 * gutter, accuracy: 1, mode)
            XCTAssertGreaterThanOrEqual(language.frame.height, 52, mode)

            // Saving without a name, with an address: the field turns red, and its message is read with its label.
            screen.type("eva@example.com", into: email)
            app.buttons["clients.add.submit"].tap()
            let message = catalog["clients.addDialog.errors.nameRequired"]
            XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { name.label.hasSuffix(message) }, mode)
            screen.settle(name)
            let colours = try ScreenColours(app)
            let danger = RGB(Tokens.Colors.statusDangerBg, in: style)
            XCTAssertLessThanOrEqual(
                colours.colour(at: CGPoint(x: gutter + 4, y: name.frame.midY)).distance(to: danger), 6,
                "the field with the error is on the danger tint, \(mode)"
            )
            let fine = RGB(Tokens.Colors.bgSurface, in: style)
            XCTAssertLessThanOrEqual(
                colours.colour(at: CGPoint(x: gutter + 4, y: email.frame.midY)).distance(to: fine), 6,
                "the other field stays on the card, \(mode)"
            )
            withExtendedLifetime(server) {}
            app.terminate()
        }
    }

    /// At the largest text size every row's name and email address wrap inside the window (an address is one word, which
    /// wraps by character), the avatar grows with the text, and the audit finds nothing clipped.
    func test_E020_AC15_klantenAtTheLargestTextSizeWrapsEveryText() throws {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let app = AppLaunch.launch(
            against: server, session: .signedIn, textSize: AppLaunch.largestTextSize
        )
        let screen = SignInScreen(app: app)
        openClients(screen, "largest")
        let all = rows(app)
        XCTAssertEqual(all.count, 3)
        screen.settle(all[0])
        let window = app.windows.firstMatch.frame
        let emails = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH 'clients.rowEmail.'"))
        XCTAssertEqual(emails.count, 3)
        for index in 0 ..< emails.count {
            let email = emails.element(boundBy: index)
            XCTAssertLessThanOrEqual(email.frame.maxX, window.maxX - gutter, "\(email.label) stays in the row")
            XCTAssertGreaterThanOrEqual(email.frame.minX, gutter, email.label)
        }
        XCTAssertGreaterThan(all[0].frame.height, 100, "a row grows with the text")
        try screen.app.performAccessibilityAudit(for: [.textClipped, .hitRegion])
        withExtendedLifetime(server) {}
        app.terminate()
    }
}
