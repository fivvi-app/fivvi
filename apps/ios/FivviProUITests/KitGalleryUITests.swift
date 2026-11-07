import XCTest

/// E020: the system's Liquid Glass components and the kit on a screen, in the Debug-only kit gallery (the screens that
/// use the kit come with their own tickets). Runs in nl and en, in two launches. How the blocks look drawn (sizes,
/// colours, light and dark) is checked by the unit tests, `KitRenderedTests`, which cost no UI time.
@MainActor
final class KitGalleryUITests: XCTestCase {
    private let timeout: TimeInterval = 10

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
                screen.dates.map { $0.lowercased() }.contains(screen.eyebrow.label.lowercased()),
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

        XCTContext.runActivity(named: "The tab bar shrinks to the selected tab while scrolling, and grows back") { _ in
            let profile = screen.tabBar.buttons[catalog["profile.title"]]
            let selected = screen.tabBar.buttons[catalog["clients.title"]]
            let fullWidth = selected.frame.width
            screen.scroll.swipeUp(velocity: .slow)
            screen.scroll.swipeUp(velocity: .slow)
            XCTAssertTrue(
                Polling.until(timeout: timeout, condition: { !profile.exists && selected.frame.width < fullWidth }),
                "the tab bar shrinks to the selected tab while scrolling down"
            )
            for _ in 0..<3 { screen.scroll.swipeDown(velocity: .fast) }
            XCTAssertTrue(
                Polling.until(timeout: timeout, condition: { profile.exists && selected.frame.width >= fullWidth }),
                "the tab bar grows back when scrolling up"
            )
        }
    }

    func test_E020_AC14_aFieldReadsItsErrorAndKeepsItsValueAndAToastComesAndGoes() {
        let screen = KitGalleryScreen.launch()
        let catalog = screen.catalog
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))

        // The field with an error: its message shows, VoiceOver reads it after the field's label, and what the person
        // types stays the field's value.
        screen.scroll(to: screen.invalidField)
        let message = catalog["clients.addDialog.errors.nameRequired"]
        XCTAssertEqual(screen.fieldError.label, message)
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
