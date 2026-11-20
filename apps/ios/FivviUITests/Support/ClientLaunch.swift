import XCTest

/// How Fivvi starts in a UI test: against Fivvi Pro's stub server (`FivviProUITests/Support`, shared with this target), in a
/// language, signed in or out, and online or offline. The connectivity is fixed by a Debug-only launch argument
/// (`-UITestConnectivity`, `Connectivity.forLaunch` in the app), so no test depends on the network of the machine.
@MainActor
enum ClientLaunch {
    /// Launches the app against `server`; `AppLaunch.launch` has the meaning of the other parameters. With
    /// `recordsOpenedLinks` the app opens no link but shows its address in `uitest.openedLink` (`OpenedLinksRecorder`,
    /// Fivvi Pro's source, shared by the project).
    static func launch(
        against server: StubServer,
        session: AppLaunch.Session,
        online: Bool = true,
        link: String? = nil,
        recordsOpenedLinks: Bool = false,
        deviceLanguages: [String]? = nil,
        textSize: String? = nil,
        appearance: String? = nil
    ) -> XCUIApplication {
        let app = XCUIApplication()
        let languages = deviceLanguages ?? [TestCatalog.configuredLanguage]
        app.launchArguments = [
            "-AppleLanguages", "(" + languages.map { "\"\($0)\"" }.joined(separator: ", ") + ")",
            "-FivviAPIBaseURL", server.baseURL.absoluteString,
            "-UITestConnectivity", online ? "online" : "offline"
        ]
        switch session {
        case .signedIn: app.launchArguments += ["-UITestSession", server.signIn.token]
        case .rejectedToken: app.launchArguments += ["-UITestSession", "token-the-server-rejects"]
        case .signedOut: app.launchArguments += ["-UITestSession", "none"]
        case .asLeft: break
        }
        // Opens the app as a Universal Link does; the phone's own handoff needs a verified association with fivvi.app.
        if let link { app.launchArguments += ["-UITestOpenLink", link] }
        if recordsOpenedLinks { app.launchArguments += ["-UITestRecordOpenedLinks", "YES"] }
        if let textSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName", textSize] }
        if let appearance { app.launchArguments += ["-UITestAppearance", appearance] }
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        ReachableLaunch.launch(app)
        return app
    }
}

/// The tabs and screens of Fivvi, found by accessibility identifier or, for the tab bar, by the tab's name in the catalog
/// (a `TabView`'s items have no identifier). The ids are the Android test tags' (`home.noWorkspace`, `profile.signOut`, …).
@MainActor
struct ClientScreen {
    let app: XCUIApplication
    let catalog: TestCatalog

    var tabBar: XCUIElement { app.tabBars.firstMatch }
    var homeTab: XCUIElement { tabBar.buttons[catalog["clientNav.home"]] }
    var bookTab: XCUIElement { tabBar.buttons[catalog["clientNav.book"]] }
    var profileTab: XCUIElement { tabBar.buttons[catalog["clientNav.profile"]] }
    /// The names of the tabs in the bar, in order.
    var tabNames: [String] { tabBar.buttons.allElementsBoundByIndex.map(\.label) }

    func noWorkspace(_ prefix: String) -> XCUIElement { app.staticTexts["\(prefix).noWorkspace"] }
    func haveLink(_ prefix: String) -> XCUIElement { app.staticTexts["\(prefix).haveLink"] }
    func teamHint(_ prefix: String) -> XCUIElement { app.staticTexts["\(prefix).teamHint"] }

    var linkSoon: XCUIElement { app.staticTexts["link.soon"] }
    var linkOpenInBrowser: XCUIElement { app.buttons["link.openInBrowser"] }
    var linkBack: XCUIElement { app.buttons["link.back"] }
    /// The address the app was asked to open, when launched with `recordsOpenedLinks` (a dash before the first).
    var openedLink: XCUIElement { app.staticTexts["uitest.openedLink"] }

    var offline: XCUIElement { app.staticTexts["client.offline"] }
    var profileTitle: XCUIElement { app.staticTexts["profile.title"] }
    var profileName: XCUIElement { app.staticTexts["profile.name"] }
    var profileEmail: XCUIElement { app.staticTexts["profile.email"] }
    var languageTitle: XCUIElement { app.staticTexts["profile.language"] }
    func language(_ locale: String) -> XCUIElement { app.buttons["profile.language.\(locale)"] }
    var signOut: XCUIElement { app.buttons["profile.signOut"] }
    var version: XCUIElement { app.staticTexts["profile.version"] }
}
