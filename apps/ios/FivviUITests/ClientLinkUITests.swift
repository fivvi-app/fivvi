import XCTest

/// E017 #505, AC6 through the real app: Anna de Vries (`anna@example.com`, an account with no workspace) opens the join link
/// of a studio from Mail or the camera. The tests start the app with the link as a launch argument (`-UITestOpenLink`), as
/// the phone does when a Universal Link opens it: the verified association with fivvi.app is not testable on a simulator.
/// Every test runs in nl and en, as `Fivvi.xctestplan` names them.
@MainActor
final class ClientLinkUITests: SignInUITestCase {
    private let catalog = TestCatalog.configured
    private let joinLink = "https://fivvi.app/j/ABCD2345"
    private let invitationLink = "https://fivvi.app/i/tok-4f9x"

    private func server() throws -> StubServer {
        try StubServer(.status(404), signIn: StubServer.SignIn(email: "anna@example.com", name: "Anna de Vries"))
    }

    private func assertPlaceholder(_ screen: ClientScreen) {
        XCTAssertTrue(screen.linkSoon.waitUntilExists(timeout: timeout), "the placeholder shows")
        XCTAssertEqual(screen.linkSoon.label, catalog["appLink.soon"])
        XCTAssertEqual(screen.linkOpenInBrowser.label, catalog["appLink.openInBrowser"])
    }

    func test_E017_AC6_openJoinLinkAfterSignIn() throws {
        let server = try server()
        let app = ClientLaunch.launch(against: server, session: .signedOut, link: joinLink)
        let screen = ClientScreen(app: app, catalog: catalog)

        // Signed out: sign-in first, not the placeholder.
        let sign = SignInScreen(app: app)
        XCTAssertTrue(sign.email.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.linkSoon.exists, "sign-in comes first")
        sign.requestCode(for: server.signIn.email, timeout: timeout)
        sign.type(server.signIn.code, into: sign.code)

        // Signed in: the placeholder, then the same address in the browser.
        assertPlaceholder(screen)
        screen.linkOpenInBrowser.tap()

        let browser = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(
            browser.wait(for: .runningForeground, timeout: externalAppLaunchTimeout), "the system browser opens"
        )
        browser.terminate()
    }

    func test_E017_AC6_aSignedInPersonSeesThePlaceholderAtOnceAndBackReturnsToTheTabs() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(), session: .signedIn, link: invitationLink), catalog: catalog
        )

        assertPlaceholder(screen)

        screen.linkBack.tap()

        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout), "back returns to the tabs")
        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.linkSoon.exists)
    }

    func test_E017_AC6_anotherAddressOfTheSiteOpensTheTabsNotThePlaceholder() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(
                against: try server(), session: .signedIn, link: "https://fivvi.app/privacy"
            ),
            catalog: catalog
        )

        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.linkSoon.exists)
    }
}
