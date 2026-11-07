import XCTest
import FivviDesignTokens

/// E020: the system's Liquid Glass components and the kit on a screen, in the Debug-only kit gallery (the screens that
/// use the kit come with their own tickets). Runs in nl and en, in two launches. How the blocks look drawn (sizes,
/// colours, light and dark) is checked by the unit tests, `KitRenderedTests`, which cost no UI time.
@MainActor
final class KitGalleryUITests: XCTestCase {
    private let timeout: TimeInterval = 10
    /// How far (per 8-bit channel) a colour on screen may be from its token: colour conversion rounds.
    private let colourTolerance = 4

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func test_E020_AC8_systemLiquidGlassComponents() throws {
        let screen = KitGalleryScreen.launch()
        let catalog = screen.catalog
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))

        try XCTContext.runActivity(named: "The large title, with the date above it") { _ in
            XCTAssertEqual(screen.title.label, catalog["clients.title"])
            XCTAssertTrue(try screen.title.hasTrait(.header))
            XCTAssertTrue(screen.eyebrow.exists)
            XCTAssertLessThanOrEqual(screen.eyebrow.frame.maxY, screen.title.frame.minY, "the date sits above")
            XCTAssertTrue(
                screen.dates.contains(screen.eyebrow.label),
                "the date \(screen.eyebrow.label) is one of \(screen.dates)"
            )
            // 34 pt at the default text size: a line of about 41 pt, the large title's line height.
            XCTAssertEqual(screen.title.frame.height, 41, accuracy: 2)
            XCTAssertNotEqual(screen.inlineTitleLabel, catalog["clients.title"], "the bar shows no title yet")
        }

        XCTContext.runActivity(named: "The tab bar, navigation buttons, sheet and alert are the system's") { _ in
            XCTAssertTrue(screen.tabBar.buttons[catalog["clients.title"]].exists)
            XCTAssertTrue(screen.tabBar.buttons[catalog["profile.title"]].exists)
            XCTAssertTrue(screen.app.navigationBars.buttons["kit.sheetButton"].exists)
            XCTAssertTrue(screen.app.navigationBars.buttons["kit.alertButton"].exists)

            XCTAssertTrue(screen.sheetButton.tap(until: screen.sheet, timeout: timeout))
            screen.app.buttons[catalog["common.cancel"]].tap()
            XCTAssertTrue(Polling.until(timeout: timeout, condition: { !screen.sheet.exists }))

            XCTAssertTrue(screen.alertButton.tap(until: screen.app.alerts.firstMatch, timeout: timeout))
            XCTAssertTrue(screen.app.alerts.firstMatch.staticTexts[catalog["noAccess.title"]].exists)
            screen.app.alerts.firstMatch.buttons[catalog["common.cancel"]].tap()
            XCTAssertTrue(Polling.until(timeout: timeout, condition: { !screen.app.alerts.firstMatch.exists }))
        }
    }

    /// The tab bar shrinks to the selected tab while the gallery scrolls down, and grows back when it scrolls up. In a
    /// launch of its own and the first thing the test does: nothing has been shown over the screen before it (a sheet
    /// or an alert earlier in the launch is one thing that could keep the system from minimising the bar).
    func test_E020_AC8_theTabBarShrinksWhileScrollingDownAndGrowsBack() throws {
        let screen = KitGalleryScreen.launch()
        let catalog = screen.catalog
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        let clients = catalog["clients.title"]
        let profile = catalog["profile.title"]
        let bar = try XCTUnwrap(
            TabBarProbe.full(of: screen.tabBar, selected: clients, other: profile, timeout: timeout),
            "the tab bar starts full: both tabs in it, the other one touchable"
        )
        XCTAssertTrue(bar.isFull, "the tab bar starts full")
        XCTAssertFalse(bar.isShrunk, "a full tab bar is not shrunk")

        // Scroll down the way a person does, until it shrinks: the gallery is several screens tall. What counts as
        // shrunk is the same for every gesture; only the finger's movement differs.
        guard let gesture = scrollDown(screen.scroll, until: { bar.isShrunk }) else {
            // Is it the screen or the system? The other tab is a plain list in a plain navigation stack: if its bar
            // shrinks and this one does not, the kit's screen is at fault; if neither does, the system is.
            let plainShrinks = plainListShrinksTheBar(screen, selected: profile, other: clients)
            XCTFail(
                "the tab bar did not shrink while scrolling down the gallery with any gesture "
                    + "(\(ScrollGesture.allCases.map(\.rawValue))); in a plain list in the other tab it "
                    + "\(plainShrinks ? "did" : "did not")"
            )
            return
        }
        XCTContext.runActivity(named: "The tab bar shrank after a \(gesture.rawValue)") { _ in }
        // The large title is gone and the bar shows it inline (the title is its own element in the bar).
        XCTAssertTrue(
            Polling.until(timeout: 2, condition: { screen.inlineTitleLabel == clients }),
            "the navigation bar shows the title once the large title has scrolled away"
        )

        // And back up, until it is full again.
        var swipes = 0
        while !Polling.until(timeout: 2, condition: { bar.isFull }), swipes < 10 {
            screen.scroll.swipeDown(velocity: .fast)
            swipes += 1
        }
        XCTAssertTrue(bar.isFull, "the tab bar grows back when scrolling up")
    }

    /// Scrolls the gallery down with each gesture in turn, a few times each, until `isShrunk` holds; returns the gesture
    /// that did it. Between gestures it scrolls back to the top, so every gesture starts from a full bar.
    private func scrollDown(
        _ scroll: XCUIElement, gestures: [ScrollGesture] = ScrollGesture.allCases, tries: Int = 3,
        until isShrunk: () -> Bool
    ) -> ScrollGesture? {
        for gesture in gestures {
            for _ in 0..<tries {
                gesture.scrollDown(scroll)
                if Polling.until(timeout: 2, condition: isShrunk) { return gesture }
            }
            for _ in 0..<tries { scroll.swipeDown(velocity: .fast) }
        }
        return nil
    }

    /// Whether a gesture shrinks the bar in the other tab, a plain list. Only run to say why the test failed.
    private func plainListShrinksTheBar(_ screen: KitGalleryScreen, selected: String, other: String) -> Bool {
        // The first match a person can touch: a tab can be in the bar twice while it animates.
        let tabs = screen.tabBar.buttons.matching(NSPredicate(format: "label == %@", selected))
        let tab = (0..<tabs.count).map { tabs.element(boundBy: $0) }.first { $0.exists && $0.isHittable }
        tab?.tap()
        guard tab != nil,
            let bar = TabBarProbe.full(of: screen.tabBar, selected: selected, other: other, timeout: timeout)
        else { return false }
        return scrollDown(screen.plainList, gestures: [.flick, .drag], tries: 2, until: { bar.isShrunk }) != nil
    }

    func test_E020_AC14_aFieldReadsItsErrorAndKeepsItsValueAndAToastComesAndGoes() throws {
        let screen = KitGalleryScreen.launch()
        let catalog = screen.catalog
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))

        // The field with an error: VoiceOver reads the label and the message once, as the field's label (the visible
        // texts are not elements of their own), and what the person types stays the field's value.
        screen.scroll(to: screen.invalidField)
        let message = catalog["clients.addDialog.errors.nameRequired"]
        XCTAssertFalse(screen.app.staticTexts[message].exists, "the message is not a second element")
        XCTAssertFalse(screen.app.staticTexts[catalog["clients.addDialog.nameLabel"]].exists, "nor is the label")
        XCTAssertEqual(screen.invalidField.label, "\(catalog["clients.addDialog.nameLabel"]), \(message)")
        XCTAssertEqual(screen.validField.label, catalog["clients.addDialog.emailLabel"], "a field without an error")

        try assertTheRoundControlsAreSolidAndTakeATapNearTheRim(screen)

        screen.scrollBack(toLowerHalf: screen.invalidField)
        screen.invalidField.tap()
        screen.invalidField.typeText("Anna")
        XCTAssertEqual(screen.invalidField.value as? String, "Anna", "the error doesn't replace the typed text")

        // The toast: its text shows, and it goes away by itself.
        screen.scroll(to: screen.stackSecond)
        screen.stackSecond.tap()
        XCTAssertTrue(screen.toastText.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.toastText.label, catalog["myProfile.errors.noConnection"])
        XCTAssertTrue(
            Polling.until(timeout: 15, condition: { !screen.toastText.exists }), "the toast goes away by itself"
        )
    }

    /// The prominent round control is a solid accent circle as the prototype draws it (a tinted glass is translucent
    /// and shows the canvas through it), and the regular one takes a tap near the rim of its circle.
    private func assertTheRoundControlsAreSolidAndTakeATapNearTheRim(_ screen: KitGalleryScreen) throws {
        screen.scroll(toUpperHalf: screen.roundRegular)
        XCTAssertTrue(screen.roundProminent.isHittable, "the prominent control can be tapped")
        // Still, before the screenshot: the list has stopped moving.
        XCTAssertTrue(Polling.settled(timeout: timeout) { screen.roundProminent.frame })
        let colours = try ScreenColours(screen.app)
        let frame = screen.roundProminent.frame
        XCTAssertEqual(frame.width, frame.height, accuracy: 0.5, "round")
        // The canvas is behind the screen, in the gutter next to the groups and the buttons.
        assertColour(
            colours.colour(at: CGPoint(x: 4, y: frame.midY)), is: RGB(Tokens.Colors.bgCanvas, in: .light),
            "the grouped-grey canvas in the gutter"
        )
        let accent = RGB(Tokens.Colors.accentFill, in: .light)
        for point in [
            CGPoint(x: frame.minX + 6, y: frame.midY), CGPoint(x: frame.maxX - 6, y: frame.midY),
            CGPoint(x: frame.midX, y: frame.minY + 6), CGPoint(x: frame.midX, y: frame.maxY - 6)
        ] {
            assertColour(colours.colour(at: point), is: accent, "a solid accent at \(point)")
        }

        XCTAssertEqual(screen.roundTaps.label, "0")
        // Near the rim, 21 pt from the middle.
        screen.roundRegular.coordinate(withNormalizedOffset: CGVector(dx: 0.84, dy: 0.84)).tap()
        XCTAssertTrue(
            Polling.until(timeout: timeout, condition: { screen.roundTaps.label == "1" }), "a tap near the rim counts"
        )
    }

    /// The colour on screen is `expected`, give or take `colourTolerance`.
    private func assertColour(_ actual: RGB, is expected: RGB, _ message: String) {
        XCTAssertLessThanOrEqual(
            actual.distance(to: expected), colourTolerance, "\(message): \(actual), expected \(expected)"
        )
    }
}
