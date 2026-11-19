import XCTest

/// Fivvi, the client app (E017 #503, spec #469): signing in with the emailed code, the tabs, the no-workspace state, *Profiel*
/// (*Taal*, *Uitloggen*), the offline banner. It runs against the stub server of Fivvi Pro's UI tests, with synthetic accounts:
/// Anna de Vries, who has no workspace, and Sarah, a Trainer of John's Gym with no client relationship. Every test runs in
/// nl and en, as `Fivvi.xctestplan` names them.
@MainActor
final class ClientAppUITests: SignInUITestCase {
    private let catalog = TestCatalog.configured

    private func server(
        name: String? = "Anna de Vries", email: String = "anna@example.com", workspace: String? = nil,
        role: String = "trainer", stored: String? = nil
    ) throws -> StubServer {
        try StubServer(
            signIn: StubServer.SignIn(
                email: email, workspaceName: workspace, role: role, preferredLocale: stored, name: name
            )
        )
    }

    /// Signs in on the sign-in screen with the code of the stub server and waits for the tabs.
    private func signIn(_ server: StubServer) throws -> ClientScreen {
        let app = ClientLaunch.launch(against: server, session: .signedOut)
        let sign = SignInScreen(app: app)
        sign.requestCode(for: server.signIn.email, timeout: timeout)
        sign.type(server.signIn.code, into: sign.code)
        let screen = ClientScreen(app: app, catalog: catalog)
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout), "the tabs show after the code")
        return screen
    }

    // MARK: AC1

    func test_E017_AC1_signInShowsTabsAndNoWorkspace() throws {
        let server = try server()
        let app = ClientLaunch.launch(against: server, session: .signedOut)
        let sign = SignInScreen(app: app)
        XCTAssertTrue(sign.logo.waitUntilExists(timeout: timeout), "the plain day dial is above the title")
        XCTAssertEqual(sign.logo.label, "Fivvi", "named Fivvi, not Fivvi Pro")

        sign.requestCode(for: server.signIn.email, timeout: timeout)
        sign.type(server.signIn.code, into: sign.code)

        let screen = ClientScreen(app: app, catalog: catalog)
        XCTAssertTrue(screen.tabBar.waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            screen.tabNames, [catalog["clientNav.home"], catalog["clientNav.book"], catalog["clientNav.profile"]]
        )
        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.noWorkspace("home").label, catalog["noWorkspace.title"])
        XCTAssertEqual(screen.haveLink("home").label, catalog["noWorkspace.haveLink"])
        XCTAssertFalse(screen.teamHint("home").exists, "an account without a team role gets no Fivvi Pro line")
        XCTAssertFalse(app.staticTexts["home.signedInAs"].exists, "this is not Fivvi Pro's home")
    }

    func test_E017_AC1_theTokenStaysOnThePhoneSoTheNextStartOpensOnTheTabs() throws {
        let server = try server()
        let screen = try signIn(server)
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/token").map(\.method), ["POST"], "signed in with the code"
        )
        screen.app.terminate()

        let again = ClientScreen(app: ClientLaunch.launch(against: server, session: .asLeft), catalog: catalog)

        XCTAssertTrue(again.tabBar.waitUntilExists(timeout: timeout), "the token is in the Keychain: no sign-in")
        XCTAssertTrue(again.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            server.requests(to: "/api/v1/me").compactMap(\.authorization).last, "Bearer \(server.signIn.token)"
        )
    }

    func test_E017_AC1_boekenShowsTheSameNoWorkspaceState() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(), session: .signedIn), catalog: catalog
        )
        XCTAssertTrue(screen.bookTab.waitUntilExists(timeout: timeout))

        screen.bookTab.tap()

        XCTAssertTrue(screen.noWorkspace("book").waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.noWorkspace("book").label, catalog["noWorkspace.title"])
        XCTAssertEqual(screen.haveLink("book").label, catalog["noWorkspace.haveLink"])
        XCTAssertFalse(screen.teamHint("book").exists)
    }

    func test_E017_AC1_profielShowsTheNameTheEmailAddressAndTheVersionAndTheyCannotBeEdited() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(), session: .signedIn), catalog: catalog
        )
        XCTAssertTrue(screen.profileTab.waitUntilExists(timeout: timeout))

        screen.profileTab.tap()

        XCTAssertTrue(screen.profileEmail.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.profileTitle.label, catalog["clientNav.profile"])
        XCTAssertEqual(screen.profileName.label, "Anna de Vries")
        XCTAssertEqual(screen.profileEmail.label, "anna@example.com")
        XCTAssertFalse(screen.app.buttons["profile.name"].exists, "the name is read-only here (editing is F033)")
        XCTAssertEqual(screen.languageTitle.label.lowercased(), catalog["profile.language"].lowercased())
        let versionPrefix = catalog["profile.version"].replacingOccurrences(of: "%1$@", with: "")
        XCTAssertTrue(screen.version.label.hasPrefix(versionPrefix))
    }

    // MARK: AC2

    func test_E017_AC2_switchingTaalChangesTheWholeAppAtOnceAndSavesItOnTheAccount() throws {
        let server = try server()
        let other = TestCatalog.configuredLanguage == "nl" ? "en" : "nl"
        let otherCatalog = TestCatalog(other)
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: server, session: .signedIn, deviceLanguages: [other]),
            catalog: otherCatalog
        )
        XCTAssertTrue(screen.profileTab.waitUntilExists(timeout: timeout), "the phone's language shows first")
        screen.profileTab.tap()
        let choice = screen.language(TestCatalog.configured.apiLocale)
        XCTAssertTrue(choice.waitUntilExists(timeout: timeout))
        XCTAssertFalse(choice.isSelected)

        choice.tap()

        // Every text of the tabs is in the choice at once, without a restart.
        let chosen = ClientScreen(app: screen.app, catalog: catalog)
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { chosen.profileTab.exists })
        XCTAssertEqual(
            chosen.tabNames, [catalog["clientNav.home"], catalog["clientNav.book"], catalog["clientNav.profile"]]
        )
        XCTAssertEqual(chosen.profileTitle.label, catalog["clientNav.profile"])
        XCTAssertTrue(choice.isSelected)
        chosen.homeTab.tap()
        XCTAssertEqual(chosen.noWorkspace("home").label, catalog["noWorkspace.title"])
        let saved = Polling.until(timeout: timeout, interval: 0.2) {
            server.preferredLocale == TestCatalog.configured.apiLocale
        }
        XCTAssertTrue(saved, "the stored preference is the choice")
        let patches = server.requests.filter { $0.method == "PATCH" && $0.path == "/api/v1/me" }
        XCTAssertEqual(patches.map(\.body), [["preferredLocale": TestCatalog.configured.apiLocale, "surface": "ios"]])
        XCTAssertEqual(patches.map(\.authorization), ["Bearer \(server.signIn.token)"])
    }

    func test_E017_AC2_theLanguageSavedOnTheAccountIsShownAfterSigningIn() throws {
        let other = TestCatalog.configuredLanguage == "nl" ? "en" : "nl"
        let stored = TestCatalog.configured.apiLocale
        let server = try server(stored: stored)

        let screen = ClientScreen(
            app: ClientLaunch.launch(against: server, session: .signedIn, deviceLanguages: [other]), catalog: catalog
        )

        let home = Polling.until(timeout: timeout, interval: 0.2) { screen.homeTab.exists }
        XCTAssertTrue(home, "the stored language wins")
        XCTAssertEqual(screen.noWorkspace("home").label, catalog["noWorkspace.title"])
    }

    func test_E017_AC2_uitloggenRemovesTheTokenAndReturnsToSignIn() throws {
        let server = try server()
        let screen = try signIn(server)
        screen.profileTab.tap()
        XCTAssertTrue(screen.signOut.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signOut.label, catalog["signOut.label"])

        screen.signOut.tap()

        let sign = SignInScreen(app: screen.app)
        XCTAssertTrue(sign.email.waitUntilExists(timeout: timeout), "the sign-in screen shows")
        XCTAssertFalse(screen.tabBar.exists)
        XCTAssertFalse(sign.notice.exists, "the person signed out themselves: no notice")
        let signOuts = server.requests(to: "/api/v1/sign-out")
        XCTAssertEqual(signOuts.map(\.method), ["POST"])
        XCTAssertEqual(
            signOuts.map(\.authorization), ["Bearer \(server.signIn.token)"],
            "the old token is the one the API ends, so it answers 401 to it afterwards"
        )
        screen.app.terminate()

        let again = SignInScreen(app: ClientLaunch.launch(against: server, session: .asLeft))

        XCTAssertTrue(again.email.waitUntilExists(timeout: timeout), "the token is gone: the app starts signed out")
    }

    func test_E017_AC2_uitloggenWorksWithoutAConnection() throws {
        let server = try server()
        let screen = try signIn(server)
        screen.profileTab.tap()
        XCTAssertTrue(screen.signOut.waitUntilExists(timeout: timeout))
        server.setOffline(true)

        screen.signOut.tap()

        XCTAssertTrue(SignInScreen(app: screen.app).email.waitUntilExists(timeout: timeout))
    }

    // MARK: AC3

    func test_E017_AC3_aTrainerIsPointedToFivviProAndSeesNoTeamData() throws {
        let server = try server(
            name: "Sarah", email: "trainer@example.com", workspace: "John's Gym", role: "trainer"
        )
        let screen = ClientScreen(app: ClientLaunch.launch(against: server, session: .signedIn), catalog: catalog)

        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.noWorkspace("home").label, catalog["noWorkspace.title"])
        XCTAssertTrue(screen.teamHint("home").waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.teamHint("home").label, catalog["noWorkspace.teamHint"])
        screen.bookTab.tap()
        XCTAssertTrue(screen.teamHint("book").waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.teamHint("book").label, catalog["noWorkspace.teamHint"])
        for tab in [screen.homeTab, screen.bookTab, screen.profileTab] {
            tab.tap()
            XCTAssertFalse(screen.app.staticTexts["John's Gym"].exists, "no workspace name")
            XCTAssertFalse(screen.app.staticTexts["workspace-0"].exists)
        }
        XCTAssertTrue(
            server.requests.filter { $0.path.contains("/workspaces") }.isEmpty,
            "the client app asks for no workspace's data"
        )
    }

    // MARK: AC9

    func test_E017_AC9_offlineTheShellShowsTheOfflineBannerOnEveryTab() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(), session: .signedIn, online: false), catalog: catalog
        )

        XCTAssertTrue(screen.offline.waitUntilExists(timeout: timeout), "the banner is on Home")
        XCTAssertEqual(screen.offline.label, catalog["common.offline"])
        screen.bookTab.tap()
        XCTAssertTrue(screen.offline.waitUntilExists(timeout: timeout), "and on Boeken")
        screen.profileTab.tap()
        XCTAssertTrue(screen.offline.waitUntilExists(timeout: timeout), "and on Profiel")
    }

    func test_E017_AC9_onlineThereIsNoBanner() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(), session: .signedIn, online: true), catalog: catalog
        )

        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.offline.exists)
    }

    func test_E017_AC9_aFailedReadShowsTheErrorAndRetryReadsAgain() throws {
        let server = try StubServer(signIn: StubServer.SignIn(workspaceName: nil, meStatus: 500))
        let screen = ClientScreen(app: ClientLaunch.launch(against: server, session: .signedIn), catalog: catalog)

        let retry = screen.app.buttons["home.retry"]
        XCTAssertTrue(retry.waitUntilExists(timeout: timeout))
        XCTAssertTrue(screen.app.staticTexts["home.error"].exists)
        XCTAssertEqual(retry.label, catalog["common.retry"])
        let before = server.requests(to: "/api/v1/me").count

        retry.tap()

        let refreshed = Polling.until(timeout: timeout, interval: 0.2) {
            server.requests(to: "/api/v1/me").count > before
        }
        XCTAssertTrue(refreshed)
    }

    // MARK: Largest text size, VoiceOver

    func test_E017_AC1_everyTabWorksAtTheLargestTextSize() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(
                against: try server(workspace: "John's Gym"), session: .signedIn, online: false,
                textSize: AppLaunch.largestTextSize
            ),
            catalog: catalog
        )
        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))
        XCTAssertTrue(screen.teamHint("home").exists)
        XCTAssertTrue(screen.offline.exists)
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType, .hitRegion])

        screen.bookTab.tap()
        XCTAssertTrue(screen.noWorkspace("book").waitUntilExists(timeout: timeout))
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType, .hitRegion])

        screen.profileTab.tap()
        XCTAssertTrue(screen.profileEmail.waitUntilExists(timeout: timeout))
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType, .hitRegion])
    }

    /// What VoiceOver reads: the tabs have names, each screen's title is a heading, the language options say which one is
    /// selected, and the buttons keep a 44 pt touch target.
    func test_E017_AC1_theScreensAreNamedAndStructuredForVoiceOver() throws {
        let screen = ClientScreen(
            app: ClientLaunch.launch(against: try server(workspace: "John's Gym"), session: .signedIn),
            catalog: catalog
        )
        XCTAssertTrue(screen.noWorkspace("home").waitUntilExists(timeout: timeout))

        for tab in [screen.homeTab, screen.bookTab, screen.profileTab] {
            XCTAssertFalse(tab.label.isEmpty, "every tab has a name")
        }
        XCTAssertTrue(try screen.noWorkspace("home").hasTrait(.header), "the title of Home is a heading")
        screen.profileTab.tap()
        XCTAssertTrue(screen.profileTitle.waitUntilExists(timeout: timeout))
        XCTAssertTrue(try screen.profileTitle.hasTrait(.header), "the title of Profiel is a heading")
        XCTAssertTrue(try screen.languageTitle.hasTrait(.header), "Taal is a heading")
        let selected = screen.language(TestCatalog.configured.apiLocale)
        XCTAssertTrue(try selected.hasTrait(.selected), "the language shown says it is selected")
        let sign = SignInScreen(app: screen.app)
        try assertTouchTarget(screen.signOut, on: sign)
        try assertTouchTarget(selected, on: sign)
    }
}
