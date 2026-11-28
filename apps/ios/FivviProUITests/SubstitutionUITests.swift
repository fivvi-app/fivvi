import XCTest

/// The substitution labels of F024 (iOS), in nl and en, against the stub server: Mike (Bakker) covers Kracht for Sarah
/// (Visser), who sees it dimmed as taken over (synthetic people). *Vandaag* and *Agenda* of both (AC4), TD-03 of the covered
/// date and the Owner's ⋯ menu, whose *De trainer vervangen* says substituting is managed on the web (design). The Owner is
/// John; the substitution itself is made on the web only.
@MainActor
final class SubstitutionUITests: PrivateSessionUITestCase {
    private let covering = StubPersonalRoutes.Substitution.covering
    private let takenOver = StubPersonalRoutes.Substitution.takenOver

    /// The person's *Vandaag* (22 September, 08:35) or, with `now` on 20 October, *Agenda* of that week, with the
    /// substitution as the API sends it for them.
    private func launchPersonal(
        _ substitution: StubPersonalRoutes.Substitution, as name: String, now: String = "2026-09-22T08:35:00+02:00",
        krachtIsNext: Bool = false
    ) throws -> XCUIApplication {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
            otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: name
        ))
        server.personalDay = .sarah
        server.personalSubstitution = substitution
        server.personalKrachtIsNext = krachtIsNext
        self.server = server
        return AppLaunch.launch(against: server, session: .signedIn, startTab: nil, now: now)
    }

    /// Taps the Agenda tab once the tab bar is up and the tab can be hit: right after launch the bar can be on screen
    /// before its buttons match their identifiers ("Automation type mismatch", #1643), and a tap then fails the test.
    private func openAgenda(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let tab = app.tabBars.buttons["tab.calendar"]
        XCTAssertTrue(tab.waitUntilExists(timeout: timeout), requestLog, file: file, line: line)
        XCTAssertTrue(
            Polling.until(timeout: timeout, condition: { tab.isHittable }), "tab.calendar is not hittable",
            file: file, line: line
        )
        tab.tap()
    }

    private func coveringText(_ name: String = StubPersonalRoutes.coveredTrainerName) -> String {
        String(format: catalog["myDay.coveringFor"], name)
    }

    private func takenOverText(_ name: String = StubPersonalRoutes.substituteName) -> String {
        String(format: catalog["myDay.takenOverBy"], name)
    }

    func test_F024_AC4_todayShowsCoveringAndTakenOver() throws {
        let mike = try launchPersonal(covering, as: StubPersonalRoutes.substituteName)
        let coveringRow = mike.buttons["today.row.\(StubPersonalRoutes.kracht)"]
        XCTAssertTrue(coveringRow.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(coveringRow.label.contains(coveringText()), "Je valt in voor Sarah: \(coveringRow.label)")
        XCTAssertFalse(coveringRow.label.contains(takenOverText()))
        mike.terminate()

        let sarah = try launchPersonal(takenOver, as: StubPersonalRoutes.coveredTrainerName)
        let away = sarah.buttons["today.row.\(StubPersonalRoutes.kracht)"]
        XCTAssertTrue(away.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(away.label.contains(takenOverText()), "Overgenomen door Mike: \(away.label)")
        XCTAssertFalse(away.label.contains(coveringText()))
        XCTAssertFalse(any("today.nudge.\(StubPersonalRoutes.kracht)", in: sarah).exists, "no actions on it")
    }

    /// The API names Kracht as Mike's next item: only the top card shows it (the rows leave it out), so the card says
    /// *Je valt in voor Sarah* (#1648), in the one VoiceOver label of its texts; Open stays a target of its own.
    func test_F024_AC4_theNextCardSaysJeValtInVoorSarahWhileKrachtIsNext() throws {
        let mike = try launchPersonal(covering, as: StubPersonalRoutes.substituteName, krachtIsNext: true)
        let open = mike.buttons["today.next.open"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), requestLog)
        let card = mike.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Kracht", coveringText())
        ).firstMatch
        XCTAssertTrue(card.waitUntilExists(timeout: timeout), "Je valt in voor Sarah on the card\n\(requestLog)")
        XCTAssertTrue(card.label.contains(coveringText()), card.label)
        XCTAssertFalse(open.label.contains(coveringText()), "the Open button is a target of its own")
        XCTAssertFalse(
            mike.buttons["today.row.\(StubPersonalRoutes.kracht)"].exists, "the next class is not in the rows as well"
        )
    }

    func test_F024_AC4_agendaShowsTheSameLabelsAndTheDimmedDateHasNoDot() throws {
        let mike = try launchPersonal(covering, as: StubPersonalRoutes.substituteName, now: "2026-10-20T08:35:00+02:00")
        openAgenda(mike)
        let coveringRow = mike.buttons["calendar.row.\(StubPersonalRoutes.krachtOctober20)"]
        XCTAssertTrue(coveringRow.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(coveringRow.label.contains(coveringText()), coveringRow.label)
        XCTAssertTrue(any("calendar.dots.2026-10-20.group", in: mike).exists, "the class he covers is a dot")
        mike.terminate()

        let sarah = try launchPersonal(
            takenOver, as: StubPersonalRoutes.coveredTrainerName, now: "2026-10-20T08:35:00+02:00"
        )
        openAgenda(sarah)
        let away = sarah.buttons["calendar.row.\(StubPersonalRoutes.krachtOctober20)"]
        XCTAssertTrue(away.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(away.label.contains(takenOverText()), away.label)
        XCTAssertFalse(any("calendar.dots.2026-10-20.group", in: sarah).exists, "not counted as one of hers")
    }

    func test_F024_AC4_theCoveringTrainerReadsJeValtInVoorSarahOnTD03() throws {
        let (screen, _) = try launch(
            opensClassDate: StubSessionRoutes.seededClassDateID,
            seededTrainer: SeededTrainer(
                id: StubSessionRoutes.myMemberID, name: StubPersonalRoutes.substituteName,
                substituteFor: StubPersonalRoutes.coveredTrainerName
            )
        )
        let banner = screen.app.staticTexts["classDate.substitution"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(banner.label, coveringText())
        XCTAssertEqual(screen.app.staticTexts["classDate.trainer"].label, catalog["sessions.page.you"])
        XCTAssertFalse(screen.app.buttons["classDate.menu"].exists, "only the Owner has a menu")
    }

    func test_F024_AC4_theOwnerReadsMikeVervangtSarahOnTD03() throws {
        let (screen, _) = try launch(
            owner: true, opensClassDate: StubSessionRoutes.seededClassDateID,
            seededTrainer: SeededTrainer(
                id: StubSessionRoutes.otherMemberID, name: StubSessionRoutes.otherTrainerName,
                substituteFor: StubPersonalRoutes.coveredTrainerName
            )
        )
        let trainer = screen.app.staticTexts["classDate.trainer"]
        XCTAssertTrue(trainer.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(
            trainer.label,
            String(
                format: catalog["classes.date.substitute"], StubPersonalRoutes.coveredTrainerName,
                StubSessionRoutes.otherTrainerName
            )
        )
        XCTAssertFalse(screen.app.staticTexts["classDate.substitution"].exists, "the banner is Mike's")
    }

    func test_F024_Design_ownersMenuHasTheSubstituteActionWhichSaysToUseTheWeb() throws {
        let (screen, _) = try launch(
            owner: true, opensClassDate: StubSessionRoutes.seededClassDateID,
            seededTrainer: SeededTrainer(id: StubSessionRoutes.myMemberID, name: "John Smit")
        )
        let app = screen.app
        let menu = app.buttons["classDate.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), requestLog)
        menu.tap()
        let substitute = app.buttons["classDate.substitute"]
        XCTAssertTrue(substitute.waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            substitute.label,
            String(format: catalog["sessions.trainerDialog.titleSubstitute"], catalog["trainerWord.trainer.word"])
        )
        substitute.tap()
        let onWeb = app.staticTexts["classDate.manageOnWeb"]
        XCTAssertTrue(onWeb.waitUntilExists(timeout: timeout))
        XCTAssertEqual(onWeb.label, catalog["classes.app.manageOnWeb"], "Dit beheer je op het web")
    }
}
