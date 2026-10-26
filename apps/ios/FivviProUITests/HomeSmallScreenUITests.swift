import XCTest

/// The signed-in home on a small screen at the largest text size (#233, F001 AC15): the account block must not squeeze
/// the hello block. The screen is the smallest iPhone the app supports (an iPhone SE, 375 × 667 pt; run with
/// `IOS_SIMULATOR="iPhone SE (3rd generation)" pnpm test:ios`) in portrait and in landscape, with a long account
/// address that wraps. On the default simulator the same checks run on a bigger screen. Runs in nl and en.
@MainActor
final class HomeSmallScreenUITests: SignInUITestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        addTeardownBlock { @MainActor in XCUIDevice.shared.orientation = .portrait }
    }

    func test_F001N_AC15_largestTextSizeInPortraitKeepsEverythingReadableAndReachable() throws {
        try assertHomeFits(in: .portrait)
    }

    func test_F001N_AC15_largestTextSizeInLandscapeKeepsEverythingReadableAndReachable() throws {
        try assertHomeFits(in: .landscapeLeft)
    }

    /// The greeting is whole on first sight and the account block doesn't cover it; the account line and Sign out are
    /// reachable, scrolling if needed, and readable, and Sign out keeps the 44 pt touch target.
    private func assertHomeFits(in orientation: UIDeviceOrientation) throws {
        XCUIDevice.shared.orientation = orientation
        let signIn = StubServer.SignIn(email: "a.long.address.for.a.trainer.with.a.long.name@example.com")
        let server = try StubServer(.greeting(key: "hello.title"), signIn: signIn)
        let screen = SignInScreen.launch(
            against: server, session: .signedIn, textSize: AppLaunch.largestTextSize
        )
        for element in [screen.greeting, screen.account, screen.signedInAs, screen.signOut] {
            XCTAssertTrue(element.waitUntilExists(timeout: timeout), "\(element.identifier) is not on screen")
            screen.settle(element)
        }
        let window = screen.app.windows.firstMatch.frame
        XCTAssertEqual(window.width > window.height, orientation.isLandscape, "the app is in \(orientation)")

        // The accessibility tree reports a view that another view covers as hittable, so what shows the greeting is
        // whole is that it ends above the account block.
        try assertReadable(screen, [screen.greeting], wholeInWindow: true)
        XCTAssertLessThanOrEqual(
            screen.greeting.frame.maxY, screen.account.frame.minY, "the account block covers the greeting"
        )

        screen.scrollIntoView(screen.signedInAs)
        screen.scrollIntoView(screen.signOut)
        try assertReadable(screen, [screen.signedInAs, screen.signOut], wholeInWindow: true)
        try assertTouchTarget(screen.signOut, on: screen)
    }
}
