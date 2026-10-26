import FivviDesignTokens
import XCTest

/// The signed-in home on a short screen at the largest text size (#233, F001 AC15): the account block must not squeeze
/// the hello block. Only the newest iPhone simulator is available, so the short screen is that iPhone in landscape,
/// with a long account address that wraps. Runs in nl and en.
@MainActor
final class HomeSmallScreenUITests: SignInUITestCase {
    private let largestTextSize = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUpWithError() throws {
        try super.setUpWithError()
        XCUIDevice.shared.orientation = .landscapeLeft
        addTeardownBlock { @MainActor in XCUIDevice.shared.orientation = .portrait }
    }

    /// The greeting is whole on first sight (the account block doesn't cover or crowd it); the account line and Sign
    /// out are reachable, scrolling if needed, whole, and Sign out keeps the 44 pt touch target.
    func test_F001N_AC15_largestTextSizeInLandscapeKeepsEverythingReadableAndReachable() throws {
        let signIn = StubServer.SignIn(email: "a.long.address.for.a.trainer.with.a.long.name@example.com")
        let server = try StubServer(.greeting(key: "hello.title"), signIn: signIn)
        let screen = SignInScreen.launch(against: server, session: .signedIn, textSize: largestTextSize)
        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout))
        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertTrue(screen.signOut.waitUntilExists(timeout: timeout))
        let window = screen.app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.width, window.height, "the app is in landscape")
        screen.settle(screen.greeting)
        screen.settle(screen.signedInAs)

        // The account block starts one gutter above its first line. The accessibility tree reports a view that another
        // view covers as hittable, so what shows the greeting is whole is that it ends above the account block.
        try assertShownWhole(screen.greeting, in: screen, reach: false)
        let accountBlockTop = screen.signedInAs.frame.minY - Tokens.Spacing.gutter
        XCTAssertLessThanOrEqual(
            screen.greeting.frame.maxY, accountBlockTop, "the account block covers the greeting"
        )

        try assertShownWhole(screen.signedInAs, in: screen, reach: true)
        try assertShownWhole(screen.signOut, in: screen, reach: true)
        try assertTouchTarget(screen.signOut, on: screen)
    }

    /// `element` is whole inside the window and not clipped; with `reach`, the screen is scrolled up until it is.
    private func assertShownWhole(_ element: XCUIElement, in screen: SignInScreen, reach: Bool) throws {
        let window = screen.app.windows.firstMatch.frame
        if reach { scrollUntilWhole(element, in: window, screen: screen) }
        screen.settle(element)
        XCTAssertTrue(element.exists, "\(element.identifier) is not on screen")
        let frame = element.frame
        XCTAssertGreaterThanOrEqual(frame.minX, window.minX, "\(element.identifier) starts left of the window")
        XCTAssertLessThanOrEqual(frame.maxX, window.maxX, "\(element.identifier) ends right of the window")
        XCTAssertGreaterThanOrEqual(frame.minY, window.minY, "\(element.identifier) starts above the window")
        XCTAssertLessThanOrEqual(frame.maxY, window.maxY, "\(element.identifier) ends below the window")
        XCTAssertTrue(element.isHittable, "\(element.identifier) can't be reached")
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType]) { issue in
            // The audit covers the whole screen; what is asked here is this element.
            guard issue.element?.identifier == element.identifier else { return true }
            XCTFail("\(issue.auditType) on \(element.identifier): \(issue.detailedDescription)")
            return true
        }
    }

    /// Drags the screen up until `element` is whole inside `window` (at most a few times).
    private func scrollUntilWhole(_ element: XCUIElement, in window: CGRect, screen: SignInScreen) {
        var left = 8
        while left > 0, !(window.contains(element.frame) && element.isHittable) {
            let start = screen.app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = screen.app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
            start.press(forDuration: 0.05, thenDragTo: end)
            left -= 1
        }
    }
}
