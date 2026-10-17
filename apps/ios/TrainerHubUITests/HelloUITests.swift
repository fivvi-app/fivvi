import TrainerHubDesignTokens
import UIKit
import XCTest

/// The hello screen against a stub API. The test plan runs the text-dependent tests in nl and en, the others in nl
/// only (`TestPlanSkips`, TrainerHub.xctestplan): the AC3 language tests, AC6 and AC7's largest text size.
@MainActor
final class HelloUITests: XCTestCase {
    private let timeout: TimeInterval = 10
    /// How far (per 8-bit channel) a colour on screen may be from its token: the screenshot's colour conversion rounds.
    private let colourTolerance = 4

    override func setUpWithError() throws {
        continueAfterFailure = false
        try TestPlanSkips.skipIfListed(self)
    }

    func test_E008_AC3_unsupportedDeviceLanguageShowsEnglish() throws {
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = HelloScreen.launch(against: server, deviceLanguages: ["de-DE", "fr-FR"])

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.greeting.label, TestCatalog("en")["hello.title"])
        XCTAssertEqual(server.requestedLocales, ["en"])
    }

    func test_E008_AC3_firstSupportedDeviceLanguageWins() throws {
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = HelloScreen.launch(against: server, deviceLanguages: ["fr-FR", "nl-BE"])

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.greeting.label, TestCatalog("nl")["hello.title"])
        XCTAssertEqual(server.requestedLocales, ["nl-NL"])
    }

    func test_E008_AC3_perAppLanguageOverridesTheDevice() throws {
        for (device, perApp, expected) in [(["de-DE"], "nl", TestCatalog("nl")), (["nl-NL"], "en", TestCatalog("en"))] {
            let server = try StubServer(.greeting(key: "hello.title"))

            let screen = HelloScreen.launch(against: server, deviceLanguages: device, perAppLanguage: perApp)

            XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout), "\(perApp) on \(device)")
            XCTAssertEqual(screen.greeting.label, expected["hello.title"], "\(perApp) on \(device)")
            XCTAssertEqual(server.requestedLocales, [expected.apiLocale], "\(perApp) on \(device)")
            screen.app.terminate()
        }
    }

    func test_E008_AC4_errorStateShowsRetry() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.status(503))

        let screen = HelloScreen.launch(against: server)

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["hello.error"])
        XCTAssertEqual(screen.retry.label, catalog["common.retry"])
        try assertTouchTarget(screen.retry, on: screen)
        XCTAssertFalse(screen.greeting.exists)

        server.answer(with: .greeting(key: "hello.title"))
        screen.retry.tap()

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.greeting.label, catalog["hello.title"])
        XCTAssertFalse(screen.error.exists)
        XCTAssertEqual(server.requestedLocales, [catalog.apiLocale, catalog.apiLocale])
    }

    func test_E008_AC4_unknownKeyShowsRetry() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.notAKey"))

        let screen = HelloScreen.launch(against: server)

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["hello.error"])
        XCTAssertTrue(screen.retry.exists)
    }

    func test_E008_AC5_loadingIndicatorHasLabel() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.hold)

        let screen = HelloScreen.launch(against: server)

        XCTAssertTrue(screen.loading.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.loading.label, catalog["common.loading"])

        server.answer(with: .greeting(key: "hello.title"))

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.loading.exists)
    }

    /// The colours on screen are the design tokens' (TrainerHubDesignTokens), resolved for light and dark mode. The
    /// app is launched in each mode (`HelloScreen.launch(appearance:)`): `XCUIDevice.appearance` doesn't switch every
    /// simulator (iOS 26.5 stays light), and the unit tests check the app follows the system otherwise.
    func test_E008_AC6_usesTokenColoursInLightAndDark() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let mode = style == .dark ? "dark" : "light"
            let canvas = RGB(Tokens.Colors.bgCanvas, in: style)
            let text = RGB(Tokens.Colors.textPrimary, in: style)
            let server = try StubServer(.status(503))

            let screen = HelloScreen.launch(against: server, appearance: mode)

            XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout), mode)
            var colours = try ScreenColours(screen.app)
            let window = screen.app.windows.firstMatch.frame
            // Above and below the centred content.
            for share in [0.2, 0.85] {
                let point = CGPoint(x: window.midX, y: window.height * share)
                assertColour(colours.colour(at: point), is: canvas, "canvas at \(point) in \(mode) mode")
            }
            assertColour(colours.foreground(in: screen.error.frame, on: canvas), is: text, "error text in \(mode) mode")
            let retry = screen.retry.frame
            // Inside the button's padding, left of its label.
            let fill = colours.colour(at: CGPoint(x: retry.minX + retry.height / 4, y: retry.midY))
            assertColour(fill, is: RGB(Tokens.Colors.actionPrimaryBg, in: style), "retry fill in \(mode) mode")
            let label = retry.insetBy(dx: retry.height / 2, dy: retry.height / 4)
            assertColour(
                colours.foreground(in: label, on: fill), is: RGB(Tokens.Colors.actionPrimaryFg, in: style),
                "retry label in \(mode) mode"
            )

            server.answer(with: .greeting(key: "hello.title"))
            screen.retry.tap()

            XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout), mode)
            colours = try ScreenColours(screen.app)
            assertColour(
                colours.foreground(in: screen.greeting.frame, on: canvas), is: text, "greeting in \(mode) mode"
            )
            screen.app.terminate()
        }
    }

    func test_E008_AC7_greetingIsHeading() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = HelloScreen.launch(against: server)

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.greeting.label, catalog["hello.title"])
        XCTAssertEqual(server.requestedLocales, [catalog.apiLocale])
        XCTAssertTrue(try screen.greeting.hasTrait(.header))
    }

    func test_E008_AC7_largestTextSizeWraps() throws {
        let server = try StubServer(.status(503))

        let screen = HelloScreen.launch(against: server, textSize: "UICTContentSizeCategoryAccessibilityXXXL")

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.error, screen.retry])
        try assertTouchTarget(screen.retry, on: screen)

        server.answer(with: .greeting(key: "hello.title"))
        screen.retry.tap()

        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.greeting])
    }

    func test_E008_AC8_displayNameComesFromTheCatalog() throws {
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = HelloScreen.launch(against: server)

        XCTAssertEqual(screen.app.label, TestCatalog.configured["app.name"])
    }

    /// The colour on screen is `expected`, give or take `colourTolerance`.
    private func assertColour(_ actual: RGB, is expected: RGB, _ message: String) {
        XCTAssertLessThanOrEqual(
            actual.distance(to: expected), colourTolerance, "\(message): \(actual), expected \(expected)"
        )
    }

    /// `element` is at least the minimum touch target, compared in the screen's device pixels (`TouchTarget`).
    private func assertTouchTarget(_ element: XCUIElement, on screen: HelloScreen) throws {
        let size = element.frame.size
        let scale = try screen.app.screenshotBitmap().scale
        XCTAssertTrue(
            TouchTarget.isMet(by: size, scale: scale),
            "\(element.identifier) is \(size.width) × \(size.height) pt at \(scale)x, "
                + "below the \(TouchTarget.minimum) pt touch target"
        )
    }

    /// No text is clipped or cut off, and every element fits the window's width.
    private func assertReadable(_ screen: HelloScreen, _ elements: [XCUIElement]) throws {
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType, .hitRegion])
        let window = screen.app.windows.firstMatch.frame
        for element in elements {
            XCTAssertGreaterThanOrEqual(element.frame.minX, window.minX, element.identifier)
            XCTAssertLessThanOrEqual(element.frame.maxX, window.maxX, element.identifier)
        }
    }
}
