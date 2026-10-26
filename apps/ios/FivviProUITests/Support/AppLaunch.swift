import XCTest

/// How the app starts in a UI test: against a stub server, in a language, signed in or out.
@MainActor
enum AppLaunch {
    /// The session the app starts with. The Keychain outlives the app's launches, so every launch says which one it
    /// wants (the Debug-only launch argument `-UITestSession`, `UITestSession` in the app), except a test of a restart.
    enum Session {
        /// Signed in with the token the stub server accepts.
        case signedIn
        /// Signed in with a token the stub server does not accept.
        case rejectedToken
        /// No token.
        case signedOut
        /// Whatever the Keychain holds from the last launch.
        case asLeft
    }

    /// The largest Dynamic Type size, as a `UIContentSizeCategory` raw value for `textSize`.
    static let largestTextSize = "UICTContentSizeCategoryAccessibilityXXXL"

    /// Launches the app against `server`.
    /// - Parameters:
    ///   - deviceLanguages: the device's preferred languages; the test-plan configuration's language when nil.
    ///   - perAppLanguage: the per-app language from iOS Settings, which UI tests can't set there, so the Debug app
    ///     takes it as a launch argument (`LanguageSources.uiTestPerAppLanguageKey` in the app).
    ///   - textSize: a `UIContentSizeCategory` raw value, e.g. `largestTextSize`.
    ///   - appearance: "light" or "dark", which the Debug app takes as a launch argument
    ///     (`LaunchAppearance.uiTestAppearanceKey` in the app); the simulator's own appearance when nil.
    static func launch(
        against server: StubServer,
        session: Session,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil,
        appearance: String? = nil
    ) -> XCUIApplication {
        let app = XCUIApplication()
        let languages = deviceLanguages ?? [TestCatalog.configuredLanguage]
        app.launchArguments = [
            "-AppleLanguages", "(" + languages.map { "\"\($0)\"" }.joined(separator: ", ") + ")",
            "-FivviAPIBaseURL", server.baseURL.absoluteString
        ]
        switch session {
        case .signedIn: app.launchArguments += ["-UITestSession", server.signIn.token]
        case .rejectedToken: app.launchArguments += ["-UITestSession", "token-the-server-rejects"]
        case .signedOut: app.launchArguments += ["-UITestSession", "none"]
        case .asLeft: break
        }
        if let perAppLanguage {
            app.launchArguments += ["-UITestPerAppLanguage", perAppLanguage]
        }
        if let textSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", textSize]
        }
        if let appearance {
            app.launchArguments += ["-UITestAppearance", appearance]
        }
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        app.launch()
        return app
    }
}
