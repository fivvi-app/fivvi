import XCTest

/// The substitution labels of F024 (iOS), in nl and en, against the stub server: Mike (Bakker) covers Kracht for Sarah
/// (Visser), who sees it dimmed as taken over (synthetic people). *Vandaag* and *Agenda* of both (AC4), TD-03 of the covered
/// date and the Owner's ⋯ menu, whose *Vervang de trainer* says substituting is managed on the web (design). The Owner is
/// John; the substitution itself is made on the web only.
@MainActor
final class SubstitutionUITests: PrivateSessionUITestCase {
    private let covering = StubPersonalRoutes.Substitution.covering
    private let takenOver = StubPersonalRoutes.Substitution.takenOver

    /// The person's *Vandaag* (22 September, 08:35) or, with `now` on 20 October, *Agenda* of that week, with the
    /// substitution as the API sends it for them.
    private func launchPersonal(
        _ substitution: StubPersonalRoutes.Substitution, as name: String, now: String = "2026-09-22T08:35:00+02:00"
    ) throws -> XCUIApplication {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
            otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: name
        ))
        server.personalDay = .sarah
        server.personalSubstitution = substitution
        self.server = server
        return AppLaunch.launch(against: server, session: .signedIn, startTab: nil, now: now)
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
        let summary = String(format: catalog["myDay.app.summary"], 3, "0", "09:00", "19:00")
        XCTAssertTrue(sarah.staticTexts[summary].exists, "not in her count of sessions: \(summary)")
        XCTAssertFalse(
            any("today.next", in: sarah).label.contains("Kracht"), "and not as the next one"
        )
    }

    func test_F024_AC4_agendaShowsTheSameLabelsAndTheDimmedDateHasNoDot() throws {
        let mike = try launchPersonal(covering, as: StubPersonalRoutes.substituteName, now: "2026-10-20T08:35:00+02:00")
        mike.tabBars.buttons["tab.calendar"].tap()
        let coveringRow = mike.buttons["calendar.row.\(StubPersonalRoutes.krachtOctober20)"]
        XCTAssertTrue(coveringRow.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(coveringRow.label.contains(coveringText()), coveringRow.label)
        XCTAssertTrue(any("calendar.dots.2026-10-20.group", in: mike).exists, "the class he covers is a dot")
        mike.terminate()

        let sarah = try launchPersonal(
            takenOver, as: StubPersonalRoutes.coveredTrainerName, now: "2026-10-20T08:35:00+02:00"
        )
        sarah.tabBars.buttons["tab.calendar"].tap()
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
