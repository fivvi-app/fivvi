import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 *Groepsles* (F021 AC5, AC7 and the design of `DECISIONS.md` §3, iOS): the class on a date as everyone on the
/// team reads it. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClassDateViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var english: Bool { language == .en }

    private func screen(
        _ api: StubAPI, id: String, memberID: String = StubSessions.myMemberID, canManage: Bool = true
    ) -> ClassDateViewModel {
        ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: id,
            catalog: Catalog(locale: language), canManage: canManage
        )
    }

    /// A class "Kracht" (English "Strength") with a Dutch and an English description, once on 6 October 2026.
    @discardableResult
    private func strength(
        _ api: StubAPI, trainer: Components.Schemas.SessionTrainer?, nameEn: String? = "Strength",
        descriptionNl: String? = "Een uur kracht voor het hele lichaam.",
        descriptionEn: String? = "An hour of strength work for the whole body."
    ) -> Components.Schemas.Session {
        let groupClass = api.classes.seed(
            nameNl: "Kracht", nameEn: nameEn, descriptionNl: descriptionNl, descriptionEn: descriptionEn,
            capacity: 8, trainer: trainer
        )
        return api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-10-06", "18:00"), minutes: 60, capacity: 8,
            trainer: trainer
        )
    }

    func test_F021_AC3_theScreenShowsTheNameTheTimeTheLocationTheTrainerAndHowFull() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = SessionFixtures.api()
        let date = strength(api, trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser"))
        let model = screen(api, id: date.id)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        let catalog = TestCatalog(language)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(model.title, english ? "Strength" : "Kracht", "the viewer's language, else Dutch")
        XCTAssertEqual(
            model.whenText,
            String(format: catalog["classes.date.timeRange"], format.longDay(date.startsAt), "19:00", "18:00")
        )
        XCTAssertEqual(model.locationName, "John's Gym")
        XCTAssertEqual(model.trainerText, "Sarah Visser")
        XCTAssertEqual(
            model.bookedText, String(format: catalog["classes.date.booked"], "0", "8", 8),
            "0/8 geboekt · 8 plekken vrij"
        )
        XCTAssertEqual(model.noBookingsText, catalog["classes.date.noBookings"])
    }

    func test_F021_AC3_theBookedLineSaysTheFreeSpotsInPlural() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let model = screen(api, id: date.id)
        await model.load()
        // The plural of the free spots is the catalog's: no digits stay unresolved, and the places show.
        XCTAssertTrue(model.bookedText.hasPrefix("0/8"), model.bookedText)
        XCTAssertFalse(model.bookedText.contains("%"), model.bookedText)
        XCTAssertTrue(model.bookedText.contains("8"), model.bookedText)
    }

    func test_F021_AC5_aDateWithoutATrainerSaysTrainerNeededInTheWorkspacesWord() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let model = screen(api, id: date.id)

        await model.load()

        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(
            model.trainerText, String(format: TestCatalog(language)["classes.trainerNeeded"], words.wordCap),
            "Trainer nodig / Trainer needed"
        )
    }

    func test_F021_AC5_theTrainerRowSaysYouForThePersonLooking() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser"))
        let own = screen(api, id: date.id, memberID: StubSessions.otherMemberID, canManage: false)
        await own.load()
        XCTAssertEqual(own.trainerText, TestCatalog(language)["sessions.page.you"])
    }

    func test_F021_Design_theNameIsDutchWhenThereIsNoEnglishName() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil, nameEn: nil)
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertEqual(model.title, "Kracht")
    }

    func test_F021_Design_theDescriptionIsInTheViewersLanguageAndOpensWithMeerAndMinder() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let model = screen(api, id: date.id)
        await model.load()
        let catalog = TestCatalog(language)

        XCTAssertEqual(
            model.descriptionText,
            english ? "An hour of strength work for the whole body." : "Een uur kracht voor het hele lichaam."
        )
        XCTAssertFalse(model.descriptionIsDutchFallback)
        XCTAssertNil(model.descriptionMarkText)
        XCTAssertFalse(model.descriptionOpen, "cut to a few lines")
        XCTAssertEqual(model.descriptionToggleText, catalog["classes.app.descriptionMore"])

        model.toggleDescription()
        XCTAssertTrue(model.descriptionOpen, "opens whole")
        XCTAssertEqual(model.descriptionToggleText, catalog["classes.app.descriptionLess"])

        model.toggleDescription()
        XCTAssertFalse(model.descriptionOpen)
    }

    func test_F021_Design_anEnglishViewerWithoutAnEnglishDescriptionReadsTheDutchOneMarkedAsDutch() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil, descriptionEn: nil)
        let model = screen(api, id: date.id)
        await model.load()

        XCTAssertEqual(model.descriptionText, "Een uur kracht voor het hele lichaam.", "never machine-translated")
        XCTAssertEqual(model.descriptionIsDutchFallback, english)
        let marked = TestCatalog(language)["classes.app.descriptionInDutch"]
        XCTAssertEqual(model.descriptionMarkText, english ? marked : nil)
    }

    func test_F021_Design_aClassWithoutADescriptionShowsNoneAndNoToggle() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil, descriptionNl: nil, descriptionEn: nil)
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertNil(model.descriptionText)
        XCTAssertNil(model.descriptionToggleText)
    }

    func test_F021_Design_aDescriptionThatCannotBeReadLeavesTheRestOfTheScreenAsItIs() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        api.classes.fail(.get, with: .status(500))
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertEqual(model.state, .loaded)
        XCTAssertNil(model.descriptionText)
    }

    func test_F021_Design_theOwnersEditItemTellsThemToUseTheWebAndTheTrainerHasNoMenu() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let owner = screen(api, id: date.id)
        await owner.load()
        let catalog = TestCatalog(language)

        XCTAssertTrue(owner.hasMenu)
        XCTAssertEqual(owner.editText, catalog["classes.app.edit"], "Les wijzigen / Edit class")
        XCTAssertNil(owner.manageOnWebText)
        owner.editTapped()
        XCTAssertEqual(owner.manageOnWebText, catalog["classes.app.manageOnWeb"], "Dit beheer je op het web")
        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(owner.ownerNoteText, String(format: catalog["classes.app.ownerNote"], words.words))

        let trainer = screen(api, id: date.id, memberID: StubSessions.otherMemberID, canManage: false)
        await trainer.load()
        XCTAssertFalse(trainer.hasMenu, "Sarah, not substituting, has no ⋯ menu")
        XCTAssertNil(trainer.ownerNoteText)
    }

    func test_F021_AC7_aTrainerReadsAnyClassDateOfTheWorkspace() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser"))
        let trainer = screen(api, id: date.id, memberID: "5b1c2d3e-0000-4000-8000-0000000000a9", canManage: false)
        await trainer.load()
        XCTAssertEqual(trainer.state, .loaded)
        XCTAssertEqual(trainer.trainerText, "Sarah Visser")
    }

    func test_F021_AC7_aClassDateOfAnotherWorkspaceOrOneWithoutAccessSaysNoPermission() async {
        let api = SessionFixtures.api()
        let model = screen(api, id: "8a0b1c2e-8a54-4b51-9a42-00000000ffff")
        await model.load()
        XCTAssertEqual(model.state, .noPermission, "404 reads as no access")

        let forbidden = screen(api, id: "x")
        var told: [WorkspaceCapabilities.Capability] = []
        let again = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: "x", catalog: Catalog(locale: language),
            canManage: false, onForbidden: { told.append($0) }
        )
        api.sessions.fail(.get, with: .forbidden)
        await again.load()
        XCTAssertEqual(again.state, .noPermission)
        XCTAssertEqual(told, [.class_read])
        _ = forbidden
    }

    func test_F021_AC6_theAddedBannerSaysGroepslesToegevoegdOnlyWhenJustAdded() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let model = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: date.id, catalog: Catalog(locale: language),
            canManage: true, added: 1
        )
        await model.load()
        XCTAssertEqual(model.addedText, TestCatalog(language)["classes.schedule.saved"], "Groepsles toegevoegd")
        let plain = screen(api, id: date.id)
        await plain.load()
        XCTAssertNil(plain.addedText)
    }

    func test_F021_Design_aFailedReadOffersARetryAndKeepsWhatWasShown() async {
        let api = SessionFixtures.api()
        let date = strength(api, trainer: nil)
        let model = screen(api, id: date.id)
        api.sessions.fail(.get, with: .status(500))
        await model.load()
        XCTAssertEqual(model.state, .failed)

        api.sessions.fail(.get, with: nil)
        await model.load()
        XCTAssertEqual(model.state, .loaded)

        api.sessions.fail(.get, with: .offline)
        await model.refresh()
        XCTAssertEqual(model.state, .loaded, "what is on screen stays when a later read fails")
    }
}
