import FivviDesignTokens
import UIKit
import XCTest

/// E020: the kit's building blocks and the system's Liquid Glass components, as a person sees them in the Debug-only
/// kit gallery (the screens that use the kit come with their own tickets). Runs in nl and en.
@MainActor
final class KitGalleryUITests: XCTestCase {
    private let timeout: TimeInterval = 10
    /// How far (per 8-bit channel) a colour on screen may be from its token: the screenshot's colour conversion rounds.
    private let colourTolerance = 4

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_E020_AC8_systemLiquidGlassComponents() {
        let screen = KitGalleryScreen.launch()
        let catalog = screen.catalog

        // The tab bar is the system's: UIKit's tab bar with a button per tab.
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        XCTAssertTrue(screen.tabBar.buttons[catalog["clients.title"]].exists)
        XCTAssertTrue(screen.tabBar.buttons[catalog["profile.title"]].exists)

        // The navigation bar's buttons are the system's toolbar buttons.
        XCTAssertTrue(screen.app.navigationBars.buttons["kit.sheetButton"].exists)
        XCTAssertTrue(screen.app.navigationBars.buttons["kit.alertButton"].exists)

        // The sheet is the system's sheet: it covers part of the screen and closes with its cancel button.
        XCTAssertTrue(screen.sheetButton.tap(until: screen.sheet, timeout: timeout))
        screen.app.buttons[catalog["common.cancel"]].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, condition: { !screen.sheet.exists }))

        // The alert is the system's alert.
        XCTAssertTrue(screen.alertButton.tap(until: screen.app.alerts.firstMatch, timeout: timeout))
        XCTAssertTrue(screen.app.alerts.firstMatch.staticTexts[catalog["noAccess.title"]].exists)
        screen.app.alerts.firstMatch.buttons[catalog["common.cancel"]].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, condition: { !screen.app.alerts.firstMatch.exists }))
    }

    func test_E020_AC8_tabBarShrinksWhileScrollingAndGrowsBack() {
        let screen = KitGalleryScreen.launch()
        let profile = screen.tabBar.buttons[screen.catalog["profile.title"]]
        XCTAssertTrue(profile.waitUntilExists(timeout: timeout))
        let selected = screen.tabBar.buttons[screen.catalog["clients.title"]]
        let fullWidth = selected.frame.width

        // Scrolling down shrinks the bar to the selected tab, the way the system's minimised tab bar does.
        screen.scroll.swipeUp(velocity: .slow)
        screen.scroll.swipeUp(velocity: .slow)
        XCTAssertTrue(
            Polling.until(timeout: timeout, condition: { !profile.exists && selected.frame.width < fullWidth }),
            "the tab bar shrinks to the selected tab while scrolling down"
        )

        // Scrolling back up grows it again.
        for _ in 0..<3 { screen.scroll.swipeDown(velocity: .fast) }
        XCTAssertTrue(
            Polling.until(timeout: timeout, condition: { profile.exists && selected.frame.width >= fullWidth }),
            "the tab bar grows back when scrolling up"
        )
    }

    func test_E020_AC8_largeTitleHasTheDateAboveIt() throws {
        let screen = KitGalleryScreen.launch()
        XCTAssertTrue(screen.title.waitUntilExists(timeout: timeout))

        XCTAssertEqual(screen.title.label, screen.catalog["clients.title"])
        XCTAssertTrue(try screen.title.hasTrait(.header))
        XCTAssertTrue(screen.eyebrow.exists)
        XCTAssertLessThanOrEqual(screen.eyebrow.frame.maxY, screen.title.frame.minY, "the date sits above the title")
        let language = TestCatalog.configuredLanguage
        let expected = Date.now.formatted(
            Date.FormatStyle(locale: Locale(identifier: language == "nl" ? "nl_NL" : "en_GB"), timeZone: amsterdam)
                .weekday(.wide).day().month(.wide)
        )
        XCTAssertEqual(screen.eyebrow.label.lowercased(), expected.lowercased())
        // 34 pt at the default text size: the title is a line of about 41 pt (the large title's line height).
        XCTAssertEqual(screen.title.frame.height, 41, accuracy: 2)
    }

    func test_E020_AC14_pillButtonsAre50PointsAndStackAt48WithTenBetween() {
        let screen = KitGalleryScreen.launch()
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        screen.scroll(to: screen.pill)

        XCTAssertEqual(screen.pill.frame.height, 50, accuracy: 0.5)

        screen.scroll(to: screen.stackThird)
        let first = screen.stackFirst.frame
        let second = screen.stackSecond.frame
        let third = screen.stackThird.frame
        for frame in [first, second, third] {
            XCTAssertEqual(frame.height, 48, accuracy: 0.5)
        }
        XCTAssertEqual(second.minY - first.maxY, 10, accuracy: 0.5)
        XCTAssertEqual(third.minY - second.maxY, 10, accuracy: 0.5)
        XCTAssertEqual(first.width, second.width, accuracy: 0.5, "stacked buttons are equal width")
    }

    func test_E020_AC14_cardsAndGroupsAreRounded26InLightAndDark() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let mode = style == .dark ? "dark" : "light"
            let screen = KitGalleryScreen.launch(appearance: mode)
            let row = screen.app.buttons["kit.row.Anna de Vries"]
            XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout), mode)
            screen.scroll(to: row)
            XCTAssertTrue(row.isHittable, mode)

            let colours = try ScreenColours(screen.app)
            let frame = row.frame
            // The first row's top-left corner is the group's: its inside is the card colour, but a point 3 pt in from
            // the corner is outside a radius of 26 and shows the canvas.
            let corner = colours.colour(at: CGPoint(x: frame.minX + 3, y: frame.minY + 3))
            assertColour(corner, is: RGB(Tokens.Colors.bgCanvas, in: style), "outside the corner in \(mode) mode")
            let inside = colours.colour(at: CGPoint(x: frame.minX + 30, y: frame.minY + 30))
            assertColour(inside, is: RGB(Tokens.Colors.bgSurface, in: style), "inside the group in \(mode) mode")
            screen.app.terminate()
        }
    }

    func test_E020_AC14_aFieldWithAnErrorTurnsRedWithAWarningIconAndTheMessage() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let mode = style == .dark ? "dark" : "light"
            let screen = KitGalleryScreen.launch(appearance: mode)
            XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout), mode)
            screen.scroll(to: screen.fieldError)

            XCTAssertEqual(screen.fieldError.label, screen.catalog["clients.addDialog.errors.nameRequired"], mode)
            let tint = RGB(Tokens.Colors.statusDangerBg, in: style)
            let colours = try ScreenColours(screen.app)
            let message = screen.fieldError.frame
            // The field's own background, left of the warning icon that sits in front of the message.
            let field = colours.colour(at: CGPoint(x: message.minX - 24, y: message.midY))
            assertColour(field, is: tint, "field in \(mode) mode")
            assertColour(
                colours.foreground(in: message, on: tint), is: RGB(Tokens.Colors.statusDangerText, in: style),
                "message in \(mode) mode"
            )
            // The icon: pixels of the danger glyph colour between the field's edge and the message.
            let icon = CGRect(x: message.minX - 18, y: message.minY, width: 14, height: message.height)
            assertColour(
                colours.foreground(in: icon, on: tint), is: RGB(Tokens.Colors.statusDangerFg, in: style),
                "warning icon in \(mode) mode"
            )
            screen.app.terminate()
        }
    }

    func test_E020_AC14_aToastShowsItsIconAndGoesAway() {
        let screen = KitGalleryScreen.launch()
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        screen.scroll(to: screen.stackSecond)

        screen.stackSecond.tap()

        XCTAssertTrue(screen.toastText.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.toastText.label, screen.catalog["myProfile.errors.noConnection"])
        XCTAssertTrue(screen.toastIcon.exists, "the toast shows its warning icon")
        XCTAssertTrue(
            Polling.until(timeout: 8, condition: { !screen.toastText.exists }), "the toast goes away by itself"
        )
    }

    private var amsterdam: TimeZone { TimeZone(identifier: "Europe/Amsterdam") ?? .gmt }

    /// The colour on screen is `expected`, give or take `colourTolerance`.
    private func assertColour(_ actual: RGB, is expected: RGB, _ message: String) {
        XCTAssertLessThanOrEqual(
            actual.distance(to: expected), colourTolerance, "\(message): \(actual), expected \(expected)"
        )
    }
}
