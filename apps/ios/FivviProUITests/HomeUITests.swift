import FivviDesignTokens
import UIKit
import XCTest

/// The signed-in home against a stub API: the language it shows, its loading and error states, its colours and its
/// text at the largest size. They are the proofs the Hello screen's tests gave, on the screen that replaced it
/// (E020 #652). The test plan runs the text-dependent tests in nl and en, the others in nl only (`TestPlanSkips`,
/// FivviPro.xctestplan); apps/ios/README.md lists which and why.
@MainActor
final class HomeUITests: SignInUITestCase {
    /// How far (per 8-bit channel) a colour on screen may be from its token: the screenshot's colour conversion rounds.
    private let colourTolerance = 4

    override func setUpWithError() throws {
        try super.setUpWithError()
        try TestPlanSkips.skipIfListed(self)
    }

    /// The server that serves one account, and the launch signed in. `offline` makes `GET /api/v1/me` fail, which is
    /// the home's error state; a test sets it back to false before it taps *Opnieuw proberen*.
    private func launch(
        offline: Bool = false,
        status: Int? = nil,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil,
        appearance: String? = nil
    ) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(.greeting(key: "hello.title"), signIn: StubServer.SignIn(meStatus: status))
        if offline { server.setOffline(true) }
        let screen = SignInScreen.launch(
            against: server, session: .signedIn, deviceLanguages: deviceLanguages, perAppLanguage: perAppLanguage,
            textSize: textSize, appearance: appearance
        )
        return (screen, server)
    }

    /// What the home says about the signed-in account in `catalog`'s language.
    private func signedInAs(_ catalog: TestCatalog, _ server: StubServer) -> String {
        String(format: catalog["home.signedInAs"], server.signIn.email)
    }

    func test_E008_AC3_unsupportedDeviceLanguageShowsEnglish() throws {
        let (screen, server) = try launch(deviceLanguages: ["de-DE", "fr-FR"])

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signedInAs.label, signedInAs(TestCatalog("en"), server))
        XCTAssertEqual(screen.app.buttons["home.openProfile"].label, TestCatalog("en")["profile.title"])
    }

    func test_E008_AC3_firstSupportedDeviceLanguageWins() throws {
        let (screen, server) = try launch(deviceLanguages: ["fr-FR", "nl-BE"])

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signedInAs.label, signedInAs(TestCatalog("nl"), server))
        XCTAssertEqual(screen.app.buttons["home.openProfile"].label, TestCatalog("nl")["profile.title"])
    }

    func test_E008_AC3_perAppLanguageOverridesTheDevice() throws {
        for (device, perApp, expected) in [(["de-DE"], "nl", TestCatalog("nl")), (["nl-NL"], "en", TestCatalog("en"))] {
            let (screen, server) = try launch(deviceLanguages: device, perAppLanguage: perApp)

            XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout), "\(perApp) on \(device)")
            XCTAssertEqual(screen.signedInAs.label, signedInAs(expected, server), "\(perApp) on \(device)")
            XCTAssertEqual(
                screen.app.buttons["home.openProfile"].label, expected["profile.title"], "\(perApp) on \(device)"
            )
            screen.app.terminate()
        }
    }

    /// The account call fails, by a lost connection or by an error status: the home shows *Opnieuw proberen* in a
    /// 44 pt target, and the call again, once it can be answered, shows the account.
    func test_E008_AC4_errorStateShowsRetry() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launch(offline: true)

        XCTAssertTrue(screen.homeRetry.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.homeRetry.label, catalog["common.retry"])
        try assertTouchTarget(screen.homeRetry, on: screen)
        XCTAssertFalse(screen.signedInAs.exists)

        server.setOffline(false)
        screen.homeRetry.tap()

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signedInAs.label, signedInAs(catalog, server))
        XCTAssertFalse(screen.homeRetry.exists)
        XCTAssertGreaterThanOrEqual(server.requests(to: "/api/v1/me").count, 2)
    }

    func test_E008_AC4_serverErrorShowsRetry() throws {
        let catalog = TestCatalog.configured
        let (screen, _) = try launch(status: 503)

        XCTAssertTrue(screen.homeRetry.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.homeRetry.label, catalog["common.retry"])
        XCTAssertFalse(screen.signedInAs.exists)
        XCTAssertFalse(screen.app.staticTexts["home.workspaceName"].exists)
    }

    func test_E008_AC5_loadingIndicatorHasLabel() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        server.holdAccountRequests(true)
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        let loading = screen.app.activityIndicators["home.loading"]

        XCTAssertTrue(loading.waitUntilExists(timeout: timeout))
        XCTAssertEqual(loading.label, catalog["common.loading"])

        server.holdAccountRequests(false)

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertFalse(loading.exists)
    }

    /// The colours on screen are the design tokens' (FivviDesignTokens), resolved for light and dark mode. The
    /// app is launched in each mode (`SignInScreen.launch(appearance:)`): `XCUIDevice.appearance` doesn't switch every
    /// simulator (iOS 26.5 stays light), and the unit tests check the app follows the system otherwise. The error
    /// state shows the canvas, the title, the filled button and, once it is retried, the account's line on its card.
    func test_E008_AC6_usesTokenColoursInLightAndDark() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let mode = style == .dark ? "dark" : "light"
            let canvas = RGB(Tokens.Colors.bgCanvas, in: style)
            let text = RGB(Tokens.Colors.textPrimary, in: style)
            let (screen, server) = try launch(offline: true, appearance: mode)

            XCTAssertTrue(screen.homeRetry.waitUntilExists(timeout: timeout), mode)
            var colours = try ScreenColours(screen.app)
            let window = screen.app.windows.firstMatch.frame
            // The screen's edge, left of the cards, and below the content.
            for share in [0.5, 0.95] {
                let point = CGPoint(x: window.minX + 2, y: window.height * share)
                assertColour(colours.colour(at: point), is: canvas, "canvas at \(point) in \(mode) mode")
            }
            let title = screen.app.staticTexts["home.title"]
            assertColour(colours.foreground(in: title.frame, on: canvas), is: text, "title in \(mode) mode")
            let retry = screen.homeRetry.frame
            // Inside the button's padding, left of its label.
            let fill = colours.colour(at: CGPoint(x: retry.minX + retry.height / 4, y: retry.midY))
            assertColour(fill, is: RGB(Tokens.Colors.actionPrimaryBg, in: style), "retry fill in \(mode) mode")
            let label = retry.insetBy(dx: retry.height / 2, dy: retry.height / 4)
            assertColour(
                colours.foreground(in: label, on: fill), is: RGB(Tokens.Colors.actionPrimaryFg, in: style),
                "retry label in \(mode) mode"
            )

            server.setOffline(false)
            screen.homeRetry.tap()

            XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout), mode)
            colours = try ScreenColours(screen.app)
            let surface = RGB(Tokens.Colors.bgSurface, in: style)
            assertColour(
                colours.foreground(in: screen.signedInAs.frame, on: surface), is: text, "account line in \(mode) mode"
            )
            screen.app.terminate()
        }
    }

    func test_E008_AC7_titleIsHeading() throws {
        let (screen, _) = try launch()
        let title = screen.app.staticTexts["home.workspaceName"]

        XCTAssertTrue(title.waitUntilExists(timeout: timeout))
        XCTAssertEqual(title.label, "John's Gym")
        XCTAssertTrue(try title.hasTrait(.header))
    }

    func test_E008_AC7_largestTextSizeWraps() throws {
        let (screen, server) = try launch(offline: true, textSize: AppLaunch.largestTextSize)

        XCTAssertTrue(screen.homeRetry.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.homeRetry])
        try assertTouchTarget(screen.homeRetry, on: screen)

        server.setOffline(false)
        screen.homeRetry.tap()

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        screen.scrollIntoView(screen.signedInAs)
        try assertReadable(screen, [screen.signedInAs])
    }

    func test_E008_AC8_displayNameComesFromTheCatalog() throws {
        let (screen, _) = try launch()

        XCTAssertEqual(screen.app.label, TestCatalog.configured["app.name"])
    }

    /// The colour on screen is `expected`, give or take `colourTolerance`.
    private func assertColour(_ actual: RGB, is expected: RGB, _ message: String) {
        XCTAssertLessThanOrEqual(
            actual.distance(to: expected), colourTolerance, "\(message): \(actual), expected \(expected)"
        )
    }
}
