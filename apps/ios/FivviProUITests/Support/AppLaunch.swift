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
    ///   - recordsOpenedLinks: the app opens no link but shows its address in `uitest.openedLink`
    ///     (`OpenedLinksRecorder` in the app), so a test can read which address a tap opened.
    ///   - opensClassDate: the app opens TD-03 of this class date once the home is ready (`UITestClassDateRoute` in the
    ///     app), as the app has no list of class dates yet.
    ///   - startTab: the tab the app opens on (`ProTab.initial` in the app): the home, where the tests of its screens are
    ///     written; nil is the real start, Vandaag (F013).
    ///   - now: the personal screens' clock, an ISO 8601 instant (`UITestClock` in the app).
    ///   - connectivity: "online" or "offline" fixes whether the phone is online (`Connectivity.forLaunch` in the app),
    ///     so a test of the offline state doesn't depend on the network of the machine; the system's when nil.
    ///   - countsRenders: the app shows how often its screens rendered in `uitest.renders` (`RenderProbe` in the app),
    ///     so a test can tell a screen that renders without end.
    static func launch(
        against server: StubServer,
        session: Session,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil,
        appearance: String? = nil,
        recordsOpenedLinks: Bool = false,
        countsRenders: Bool = false,
        opensClassDate: String? = nil,
        startTab: String? = "home",
        now: String? = nil,
        connectivity: String? = nil
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
        let options: [(String, String?)] = [
            ("-UITestPerAppLanguage", perAppLanguage), ("-UIPreferredContentSizeCategoryName", textSize),
            ("-UITestAppearance", appearance), ("-UITestRecordOpenedLinks", recordsOpenedLinks ? "YES" : nil),
            ("-UITestCountRenders", countsRenders ? "YES" : nil), ("-UITestStartTab", startTab),
            ("-UITestNow", now), ("-UITestOpenClassDate", opensClassDate),
            ("-UITestConnectivity", connectivity)
        ]
        for case let (key, value?) in options { app.launchArguments += [key, value] }
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        ReachableLaunch.launch(app)
        return app
    }
}
