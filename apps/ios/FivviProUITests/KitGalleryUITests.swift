import XCTest

/// E020: the system's Liquid Glass components and the kit on a screen, in the Debug-only kit gallery (the screens that
/// use the kit come with their own tickets). Runs in nl and en, in two launches. How the blocks look drawn (sizes,
/// colours, light and dark) is checked by the unit tests, `KitRenderedTests`, which cost no UI time.
@MainActor
final class KitGalleryUITests: XCTestCase {
    private let timeout: TimeInterval = 10

    /// A date's words in lower case, without commas: the order of the words is what matters, and the CLDR version
    /// of iOS 26 and 27 may or may not write one after the weekday.
    private static func plain(_ date: String) -> String {
        date.replacingOccurrences(of: ",", with: "").lowercased()
    }

    override func setUpWithError() throws {
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
                screen.dates.map(Self.plain).contains(Self.plain(screen.eyebrow.label)),
                "the date \(screen.eyebrow.label) is one of \(screen.dates)"
            )
            // 34 pt at the default text size: a line of about 41 pt, the large title's line height.
            XCTAssertEqual(screen.title.frame.height, 41, accuracy: 2)
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

        try assertTheTabBarShrinksWhileScrollingAndGrowsBack(screen)
    }

    /// The tab bar shrinks to the selected tab while the gallery scrolls down, and grows back when it scrolls up.
    private func assertTheTabBarShrinksWhileScrollingAndGrowsBack(_ screen: KitGalleryScreen) throws {
        let catalog = screen.catalog
        // Everything is read through queries and snapshots, which don't fail the test when the bar animates and an
        // element is gone a moment later; a tab can also match with more than one element in the bar's tree.
        let tabs = screen.tabBar.buttons
        let profileLabel = catalog["profile.title"]
        let profile = tabs.matching(NSPredicate(format: "label == %@", profileLabel))
        // The other tab can be hit: some match is there and hittable (checked match by match, `exists` first, so a match
        // that goes while the bar animates counts as gone and doesn't fail the test).
        let otherCanBeHit = {
            (0..<profile.count).contains { index in
                let element = profile.element(boundBy: index)
                return element.exists && element.isHittable
            }
        }
        let selected = tabs.matching(NSPredicate(format: "label == %@", catalog["clients.title"]))
        let widthOfSelected = {
            selected.allElementsBoundByIndex.compactMap { try? $0.snapshot().frame.width }.max() ?? 0
        }
        let widthOfBar = { (try? screen.tabBar.snapshot().frame.width) ?? 0 }
        let fullWidth = widthOfSelected()
        let fullBar = widthOfBar()
        XCTAssertGreaterThan(fullWidth, 0)
        // Shrunk: the other tab can't be hit any more (it is gone from the bar, or hidden in it), or the selected tab
        // or the bar itself is narrower. iOS 26.0 to 27 report a minimised bar a little differently; a full bar is
        // none of these, so this fails without `tabBarMinimizeBehavior`.
        let isShrunk = {
            !otherCanBeHit() || widthOfSelected() < fullWidth - 1 || widthOfBar() < fullBar - 1
        }
        XCTAssertFalse(isShrunk(), "the tab bar starts full")
        // Scroll down until it shrinks: the gallery is several screens tall.
        var swipes = 0
        while !Polling.until(timeout: 2, condition: isShrunk), swipes < 6 {
            screen.scroll.swipeUp(velocity: .slow)
            swipes += 1
        }
        XCTAssertTrue(isShrunk(), "the tab bar shrinks to the selected tab while scrolling down")
        // And back up, until it is full again.
        swipes = 0
        while !Polling.until(timeout: 2, condition: { !isShrunk() }), swipes < 10 {
            screen.scroll.swipeDown(velocity: .fast)
            swipes += 1
        }
        XCTAssertFalse(isShrunk(), "the tab bar grows back when scrolling up")
    }

    func test_E020_AC14_aFieldReadsItsErrorAndKeepsItsValueAndAToastComesAndGoes() {
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
        screen.invalidField.tap()
        screen.invalidField.typeText("Anna")
        XCTAssertEqual(screen.invalidField.value as? String, "Anna", "the error doesn't replace the typed text")
        XCTAssertEqual(screen.validField.label, catalog["clients.addDialog.emailLabel"], "a field without an error")

        // The toast: its text shows, and it goes away by itself.
        screen.scroll(to: screen.stackSecond)
        screen.stackSecond.tap()
        XCTAssertTrue(screen.toastText.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.toastText.label, catalog["myProfile.errors.noConnection"])
        XCTAssertTrue(
            Polling.until(timeout: 15, condition: { !screen.toastText.exists }), "the toast goes away by itself"
        )
    }
}
