import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 *Groepsles* of a substituted date (F024 AC4 and the design of `DECISIONS.md` §3, iOS): the covering trainer reads
/// "Je valt in voor Sarah", everyone else "Mike (vervangt Sarah)", and the Owner's ⋯ menu has the substitute action, which
/// says it is managed on the web. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClassDateSubstitutionTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }
    private let mike = Components.Schemas.SessionTrainer(id: StubSessions.otherMemberID, name: "Mike Bakker")
    private let sarah = Components.Schemas.SubstituteFor(
        id: "5b1c2d3e-0000-4000-8000-0000000000b1", trainerProfileId: "6e1c2d3e-0000-4000-8000-0000000000b1",
        name: "Sarah Visser"
    )

    private func screen(
        _ api: StubAPI, id: String, memberID: String = StubSessions.myMemberID, canManage: Bool = true
    ) -> ClassDateViewModel {
        ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: id,
            catalog: Catalog(locale: language), canManage: canManage
        )
    }

    /// Kracht on Tuesday 20 October 2026 at 18:00, taught by `trainer` for `substituteFor` when it is given.
    private func kracht(
        _ api: StubAPI, trainer: Components.Schemas.SessionTrainer?,
        substituteFor: Components.Schemas.SubstituteFor? = nil
    ) -> Components.Schemas.Session {
        let groupClass = api.classes.seed(
            nameNl: "Kracht", nameEn: "Strength", descriptionNl: nil, descriptionEn: nil, capacity: 8, trainer: trainer
        )
        let date = api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-10-20", "18:00"), minutes: 60, capacity: 8,
            trainer: trainer
        )
        if let substituteFor { api.sessions.substitute(date.id, for: substituteFor) }
        return date
    }

    func test_F024_AC4_theCoveringTrainerReadsJeValtInVoorSarahOnTheClassDate() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: mike, substituteFor: sarah)
        let covering = screen(api, id: date.id, memberID: StubSessions.otherMemberID, canManage: false)

        await covering.load()

        XCTAssertEqual(covering.substitutionBannerText, String(format: catalog["myDay.coveringFor"], "Sarah Visser"))
        XCTAssertEqual(covering.trainerText, catalog["sessions.page.you"], "Mike's own row still says Jij")
    }

    func test_F024_AC4_everyoneElseReadsTheSubstituteWithWhomHeReplaces() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: mike, substituteFor: sarah)
        let owner = screen(api, id: date.id)

        await owner.load()

        XCTAssertEqual(
            owner.trainerText, String(format: catalog["classes.date.substitute"], "Sarah Visser", "Mike Bakker"),
            "Mike (vervangt Sarah)"
        )
        XCTAssertNil(owner.substitutionBannerText, "the banner is for the one who covers")
    }

    func test_F024_AC4_aDateWithoutASubstitutionHasNoBannerAndTheTrainersName() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: mike)
        let own = screen(api, id: date.id, memberID: StubSessions.otherMemberID, canManage: false)
        await own.load()
        XCTAssertNil(own.substitutionBannerText)
        XCTAssertEqual(own.trainerText, catalog["sessions.page.you"])

        let owner = screen(api, id: date.id)
        await owner.load()
        XCTAssertEqual(owner.trainerText, "Mike Bakker")
    }

    func test_F024_Design_theOwnersMenuHasTheSubstituteActionWhichSaysToUseTheWeb() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: .init(id: StubSessions.myMemberID, name: "Sarah Visser"))
        let owner = screen(api, id: date.id)
        await owner.load()

        XCTAssertTrue(owner.showsSubstitute)
        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(
            owner.substituteText, String(format: catalog["sessions.trainerDialog.titleSubstitute"], words.word)
        )
        XCTAssertNil(owner.manageOnWebText)

        owner.substituteTapped()

        XCTAssertEqual(owner.manageOnWebText, catalog["classes.app.manageOnWeb"], "Dit beheer je op het web")
    }

    func test_F024_Design_aDateWithoutATrainerHasNoSubstituteAction() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: nil)
        let owner = screen(api, id: date.id)
        await owner.load()
        XCTAssertTrue(owner.hasMenu)
        XCTAssertFalse(owner.showsSubstitute, "there is nobody to replace")
    }

    func test_F024_Design_aTrainerWhoIsCoveringHasNoMenuBecauseOnlyTheOwnerSubstitutes() async {
        let api = SessionFixtures.api()
        let date = kracht(api, trainer: mike, substituteFor: sarah)
        let covering = screen(api, id: date.id, memberID: StubSessions.otherMemberID, canManage: false)
        await covering.load()
        XCTAssertFalse(covering.hasMenu)
        XCTAssertFalse(covering.showsSubstitute)
    }
}
