import XCTest

/// F064 AC17 (spec #611, ticket #646): on *Profiel* the person finds *Hulp en contact* and *Privacyverklaring*, which
/// open the page of the website in the language shown, in nl and en. The app records the address instead of opening
/// the browser (`-UITestRecordOpenedLinks`), so the test reads the exact URL.
@MainActor
final class ProfileSiteLinksUITests: SignInUITestCase {
    private func openProfile() throws -> SignInScreen {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let screen = SignInScreen.launch(against: server, session: .signedIn, recordsOpenedLinks: true)
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        let language = screen.app.staticTexts["profile.language"]
        XCTAssertTrue(open.tap(until: language, timeout: timeout))
        return screen
    }

    /// The row with the test id; a link row is found as any element, so the test doesn't depend on its trait.
    private func row(_ id: String, in screen: SignInScreen) -> XCUIElement {
        screen.app.descendants(matching: .any)[id].firstMatch
    }

    func test_F064_AC17_profileHasRowsForHelpAndContactAndThePrivacyPolicy() throws {
        let catalog = TestCatalog.configured
        let screen = try openProfile()
        let support = row("profile.support", in: screen)
        let privacy = row("profile.privacy", in: screen)

        screen.scrollIntoView(privacy)

        XCTAssertTrue(support.exists)
        XCTAssertEqual(support.label, catalog["profile.support"])
        XCTAssertEqual(privacy.label, catalog["profile.privacy"])
        XCTAssertLessThan(support.frame.minY, privacy.frame.minY, "help and contact comes first")
        try assertTouchTarget(support, on: screen)
        try assertTouchTarget(privacy, on: screen)
    }

    func test_F064_AC17_tappingARowOpensThePageOfTheWebsiteInTheLanguageShown() throws {
        let screen = try openProfile()
        let opened = screen.app.staticTexts["uitest.openedLink"]
        let prefix = TestCatalog.configuredLanguage == "nl" ? "https://fivvi.app" : "https://fivvi.app/en"

        screen.scrollIntoView(row("profile.privacy", in: screen))
        row("profile.support", in: screen).tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { opened.label == "\(prefix)/support" })

        row("profile.privacy", in: screen).tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { opened.label == "\(prefix)/privacy" })
    }
}
