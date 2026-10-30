import XCTest

/// F010: the language switch of *Profiel → Taal* and of TM-01, saved on the account, in nl and en. The phone is in the
/// other language than the test plan's, so what the app shows is the choice, not the device.
@MainActor
final class LanguageUITests: SignInUITestCase {
    private let other = TestCatalog.configuredLanguage == "nl" ? "en" : "nl"

    /// The locale the API stores for a language of the catalogs.
    private func apiLocale(_ language: String) -> String { TestCatalog(language).apiLocale }

    private func launchSignedIn(_ stored: String? = nil, device: String) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"), signIn: StubServer.SignIn(preferredLocale: stored)
        )
        return (SignInScreen.launch(against: server, session: .signedIn, deviceLanguages: [device]), server)
    }

    func test_F010_AC3_inAppSwitchRerendersAndSaves() throws {
        let configured = TestCatalog.configured
        let (screen, server) = try launchSignedIn(device: other)
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertEqual(open.label, TestCatalog(other)["profile.title"], "the phone's language")
        open.tap()

        let choice = screen.app.buttons["profile.language.\(apiLocale(TestCatalog.configuredLanguage))"]
        XCTAssertTrue(choice.waitUntilExists(timeout: timeout))
        try assertTouchTarget(choice, on: screen)
        XCTAssertFalse(choice.isSelected)
        choice.tap()

        // The screen is in the choice at once, without a restart.
        let title = screen.app.staticTexts["profile.title"]
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { title.label == configured["profile.title"] })
        XCTAssertEqual(screen.app.staticTexts["profile.language"].label, configured["profile.language"])
        XCTAssertTrue(choice.isSelected)
        XCTAssertTrue(screen.app.staticTexts["profile.workspacesTitle"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            screen.app.staticTexts["profile.workspacesTitle"].label, configured["myProfile.workspacesTitle"]
        )
        XCTAssertEqual(
            screen.app.staticTexts["profile.workspaceRole.workspace-0"].label, configured["roles.owner"],
            "the roles are labelled again in the new language"
        )
        let saved = Polling.until(timeout: timeout, interval: 0.2) {
            server.preferredLocale == self.apiLocale(TestCatalog.configuredLanguage)
        }
        XCTAssertTrue(saved, "the stored preference is the choice")
        let patches = server.requests.filter { $0.method == "PATCH" && $0.path == "/api/v1/me" }
        XCTAssertEqual(patches.map(\.body), [["preferredLocale": apiLocale(TestCatalog.configuredLanguage)]])
        XCTAssertEqual(patches.map(\.authorization), ["Bearer \(server.signIn.token)"])
        XCTAssertFalse(screen.app.staticTexts["profile.language.error"].exists)

        // Back on the home the greeting and the buttons are in it too, and the choice survives a restart.
        screen.app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { open.label == configured["profile.title"] })
        screen.app.terminate()
        let again = SignInScreen.launch(
            against: server, session: .signedIn, deviceLanguages: [other], perAppLanguage: nil
        )
        XCTAssertTrue(again.app.buttons["home.openProfile"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(again.app.buttons["home.openProfile"].label, configured["profile.title"])
    }

    func test_F010_AC2_adoptsStoredPreferenceOnForeground() throws {
        let configured = TestCatalog.configured
        // The phone and the app are in the other language; the web then changes the preference to the configured one.
        let (screen, server) = try launchSignedIn(device: other)
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertEqual(open.label, TestCatalog(other)["profile.title"])

        server.preferredLocale = apiLocale(TestCatalog.configuredLanguage)
        XCUIDevice.shared.press(.home)
        _ = screen.app.wait(for: .runningBackground, timeout: timeout)
        screen.app.activate()
        XCTAssertTrue(screen.app.wait(for: .runningForeground, timeout: timeout))

        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { open.label == configured["profile.title"] })
        XCTAssertEqual(screen.signedInAs.label, String(format: configured["home.signedInAs"], server.signIn.email))
        XCTAssertTrue(server.requests.filter { $0.method == "PATCH" }.isEmpty, "adopting saves nothing")
    }

    func test_F010_AC4_signedOutChoiceKeptLocally() throws {
        let configured = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server, deviceLanguages: [other])
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.title.label, TestCatalog(other)["signIn.title"])
        let choice = screen.app.buttons["signIn.language.\(apiLocale(TestCatalog.configuredLanguage))"]
        try assertTouchTarget(choice, on: screen)

        choice.tap()

        let isDutchOrEnglish = Polling.until(timeout: timeout, interval: 0.2) {
            screen.title.label == configured["signIn.title"]
        }
        XCTAssertTrue(isDutchOrEnglish)
        XCTAssertTrue(choice.isSelected)
        XCTAssertEqual(screen.sendCode.label, configured["signIn.sendCode"])

        // The phone keeps it, and the sign-in email follows it.
        screen.app.terminate()
        let again = SignInScreen.launch(against: server, session: .asLeft, deviceLanguages: [other])
        XCTAssertTrue(again.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(again.title.label, configured["signIn.title"])
        again.requestCode(for: server.signIn.email)
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/request").map(\.body),
            [["email": server.signIn.email, "locale": apiLocale(TestCatalog.configuredLanguage)]]
        )

        // Signing in saves the choice on the account.
        again.type(server.signIn.code, into: again.code)
        XCTAssertTrue(again.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(again.signedInAs.label, String(format: configured["home.signedInAs"], server.signIn.email))
        let saved = Polling.until(timeout: timeout, interval: 0.2) {
            server.preferredLocale == self.apiLocale(TestCatalog.configuredLanguage)
        }
        XCTAssertTrue(saved)
    }
}
