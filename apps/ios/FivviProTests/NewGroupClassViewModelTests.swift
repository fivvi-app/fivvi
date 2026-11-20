import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-05 *Nieuwe groepsles* (F021 AC6 and the design of `DECISIONS.md` §3, iOS): the form collects, the API creates the
/// class and its one date in one request. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class NewGroupClassViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func form(
        _ api: StubAPI, onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> NewGroupClassViewModel {
        NewGroupClassViewModel(
            api: api, workspace: SessionFixtures.workspace(as: StubSessions.myMemberID),
            catalog: Catalog(locale: language), email: "owner@example.com", accountName: "Owner",
            now: SessionFixtures.now, onForbidden: onForbidden
        )
    }

    func test_F021_AC6_theOwnerAddsMobilityOnADateInOneRequestAndGetsTheClassDate() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        XCTAssertEqual(model.load, .ready)
        XCTAssertEqual(model.locationName, "John's Gym")
        XCTAssertEqual(model.trainers.map(\.name), ["Owner", "Sarah Visser"])
        XCTAssertEqual(model.trainerID, StubSessions.myMemberID, "the Owner's own place, found by the team-member ID")
        XCTAssertEqual(model.time.localDate, "2026-11-16")
        XCTAssertEqual(model.time.localStart, "09:00")
        model.nameNl = "Mobility"

        let date = await model.save()

        let sent = try XCTUnwrap(api.classes.creates.first)
        XCTAssertEqual(api.classes.creates.count, 1, "one request makes the class and its date")
        XCTAssertEqual(sent.nameNl, "Mobility")
        XCTAssertNil(sent.nameEn, "a blank text is none")
        XCTAssertEqual(sent.capacity, 12)
        XCTAssertEqual(sent.durationMinutes, 60)
        XCTAssertEqual(sent.trainerId, StubSessions.myMemberID)
        XCTAssertEqual(sent.firstDate?.localDate, "2026-11-16")
        XCTAssertEqual(sent.firstDate?.localStart, "09:00")
        XCTAssertNotEqual(sent.firstDate?._repeat, .weekly, "Herhalen: Niet herhalen (F022 is the weekly option)")
        XCTAssertEqual(sent.surface, .ios)
        XCTAssertEqual(api.classes.all.map(\.nameNl), ["Mobility"])
        XCTAssertEqual(date?._type, .group)
        XCTAssertEqual(date?.groupClass?.nameNl, "Mobility")
        XCTAssertEqual(date?.capacity, 12)
    }

    func test_F021_Design_theDescriptionsInDutchAndEnglishAreSentAndTheEnglishNameToo() async throws {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        model.nameEn = "Mobility flow"
        model.descriptionNl = "Rustig bewegen en rekken."
        model.descriptionEn = "Gentle moving and stretching."

        _ = await model.save()

        let sent = try XCTUnwrap(api.classes.creates.first)
        XCTAssertEqual(sent.nameEn, "Mobility flow")
        XCTAssertEqual(sent.descriptionNl, "Rustig bewegen en rekken.")
        XCTAssertEqual(sent.descriptionEn, "Gentle moving and stretching.")
        let stored = try XCTUnwrap(api.classes.all.first)
        XCTAssertEqual(stored.descriptionNl, "Rustig bewegen en rekken.")
        XCTAssertEqual(stored.descriptionEn, "Gentle moving and stretching.")
    }

    func test_F021_AC5_trainerNeededSendsNoTrainerAndTheDateHasNone() async throws {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Yoga"
        let catalog = TestCatalog(language)
        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(model.trainerNeededText, String(format: catalog["classes.trainerNeeded"], words.wordCap))
        model.trainerID = ""

        let date = await model.save()

        XCTAssertNil(api.classes.creates.first?.trainerId)
        XCTAssertNotNil(date)
        XCTAssertNil(date?.trainer, "Trainer nodig")
    }

    func test_F021_AC5_anOwnerWhoDoesNotTrainStartsOnTrainerNeeded() async {
        let api = SessionFixtures.api()
        api.sessions.setTrainers([.init(id: StubSessions.otherMemberID, name: "Sarah Visser")], members: [])
        let model = form(api)
        await model.start()
        XCTAssertEqual(model.trainerID, "", "no place of their own among the trainers: Trainer nodig")
    }

    func test_F021_Design_theLabelsNameTheirLanguageAndTheSectionsAreTitled() async {
        let model = form(SessionFixtures.api())
        let catalog = TestCatalog(language)
        XCTAssertEqual(model.titleText, catalog["workspaceNav.newGroupClass"])
        XCTAssertEqual(model.nameNlLabel, catalog["classes.form.nameNlLabel"])
        XCTAssertEqual(model.nameEnLabel, catalog["classes.form.nameEnLabel"])
        XCTAssertEqual(model.descriptionNlLabel, catalog["classes.form.descriptionNlLabel"])
        XCTAssertEqual(model.descriptionEnLabel, catalog["classes.form.descriptionEnLabel"])
        XCTAssertEqual(model.repeatText, catalog["classes.schedule.repeatNone"], "Niet herhalen")
        XCTAssertEqual(model.nameSectionText, catalog["classes.form.nameSection"])
        XCTAssertEqual(model.classSectionText, catalog["classes.form.classSection"])
        XCTAssertEqual(model.whenSectionText, catalog["classes.schedule.whenSection"])
    }

    func test_F021_AC6_theAPIRefusesWhatItDoesNotAcceptAndTheFormShowsAMessagePerFieldAndKeepsTheInput() async {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        let catalog = TestCatalog(language)
        model.nameNl = "   "
        model.capacity = 0

        let date = await model.save()

        XCTAssertNil(date)
        XCTAssertEqual(model.nameErrorText, catalog["classes.form.errors.nameRequired"])
        XCTAssertTrue(api.classes.all.isEmpty, "nothing is stored")

        model.nameNl = "Mobility"
        _ = await model.save()
        XCTAssertNil(model.nameErrorText, "the next save asks again")
        XCTAssertEqual(
            model.capacityErrorText, String(format: catalog["classes.form.errors.capacityInvalid"], "100", "1")
        )

        model.capacity = 10
        model.setEnd(SessionFixtures.at("2026-11-16", "08:00"))
        _ = await model.save()
        XCTAssertEqual(model.endErrorText, catalog["classes.edit.errors.endBeforeStart"])
        XCTAssertEqual(model.nameNl, "Mobility", "what was typed stays")
    }

    func test_F021_Design_anEndThatIsNotInFiveMinuteStepsIsWordedAsTheAPIRefusedIt() async {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        model.setEnd(SessionFixtures.at("2026-11-16", "10:07"))

        let date = await model.save()

        XCTAssertNil(date)
        XCTAssertEqual(
            model.endErrorText,
            String(format: TestCatalog(language)["classes.edit.errors.invalidDuration"], "240", "15", "5")
        )
    }

    func test_F021_Design_theEndFollowsTheStartAndTheEndSetsTheLength() async {
        let model = form(SessionFixtures.api())
        await model.start()
        XCTAssertEqual(model.time.durationMinutes, 60)
        model.setEnd(SessionFixtures.at("2026-11-16", "10:30"))
        XCTAssertEqual(model.time.durationMinutes, 90)
        model.time.start = SessionFixtures.at("2026-11-17", "18:00")
        XCTAssertEqual(model.end, SessionFixtures.at("2026-11-17", "19:30"), "the length stays when the start moves")
    }

    func test_F021_AC6_aStartTheClocksSkipIsWordedUnderTheTimeAndNothingIsStored() async {
        let api = SessionFixtures.api()
        api.classes.fail(.create, with: .badRequest(path: "firstDate.localStart", code: "time_does_not_exist"))
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"

        let date = await model.save()

        XCTAssertNil(date)
        XCTAssertEqual(model.time.refusal, .timeDoesNotExist)
        XCTAssertNotNil(model.time.refusalText)
        XCTAssertNil(model.saveFailureText)
        XCTAssertEqual(model.nameNl, "Mobility")
    }

    func test_F021_AC6_withoutAConnectionTheFormSaysSoAndSavingIsOffAndNothingIsQueued() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.location, with: .offline)
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"

        XCTAssertEqual(model.load, .offline)
        XCTAssertEqual(model.offlineText, TestCatalog(language)["sessions.form.offline"])
        XCTAssertFalse(model.canSave)
        let date = await model.save()
        XCTAssertNil(date)
        XCTAssertTrue(api.classes.creates.isEmpty, "nothing is queued")

        api.sessions.fail(.location, with: nil)
        await model.start()
        XCTAssertTrue(model.canSave, "back online it can save again")

        api.classes.fail(.create, with: .offline)
        _ = await model.save()
        XCTAssertNotNil(model.offlineText, "a save that couldn't reach the API says offline too")
        XCTAssertNil(model.saveFailureText)
        XCTAssertEqual(model.nameNl, "Mobility")
    }

    func test_F021_AC7_aRefusedPermissionSaysSoAndTellsTheCapabilityHelper() async {
        let api = SessionFixtures.api()
        api.classes.fail(.create, with: .forbidden)
        var forbidden: [WorkspaceCapabilities.Capability] = []
        let model = form(api, onForbidden: { forbidden.append($0) })
        await model.start()
        model.nameNl = "Mobility"

        let date = await model.save()

        XCTAssertNil(date)
        XCTAssertEqual(forbidden, [.class_manage])
        XCTAssertEqual(model.saveFailureText, TestCatalog(language)["classes.form.errors.noPermission"])
    }

    func test_F021_AC6_anyOtherFailureSaysNotSavedAndKeepsTheInput() async {
        let api = SessionFixtures.api()
        api.classes.fail(.create, with: .status(500))
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        _ = await model.save()
        XCTAssertEqual(model.saveFailureText, TestCatalog(language)["classes.form.errors.notSaved"])
        XCTAssertEqual(model.nameNl, "Mobility")
    }

    func test_F021_Design_aTrainerWhoHasSomethingThenIsWarnedAndSaveAnywayCreatesTheClass() async throws {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "09:30"),
            trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser")
        )
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        model.trainerID = StubSessions.otherMemberID

        let date = await model.save()

        XCTAssertNil(date, "nothing was stored")
        XCTAssertTrue(api.classes.all.isEmpty)
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            model.doubleBookingTitle, String(format: catalog["sessions.doubleBooking.title"], "Sarah Visser")
        )
        XCTAssertTrue(model.doubleBookingMessage.contains("Mark Jansen"), model.doubleBookingMessage)
        XCTAssertNil(model.saveFailureText, "a warning is not a failure")

        model.dismissDoubleBooking()
        XCTAssertEqual(api.classes.creates.count, 1, "Terug sends nothing")

        let anyway = await model.save(allowConflicts: true)
        XCTAssertNotNil(anyway)
        XCTAssertEqual(api.classes.creates.last?.allowConflicts, true)
        XCTAssertEqual(api.classes.creates.last?.firstDate?.localStart, "09:00", "the same request, sent again")
    }

    func test_F021_Design_anOwnerWhoPlansForThemselfIsToldJeHebtDanAlIets() async {
        let api = SessionFixtures.api()
        api.sessions.seed(
            client: SessionFixtures.client(api, "Mark Jansen"), start: SessionFixtures.at("2026-11-16", "09:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Owner")
        )
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        _ = await model.save()
        XCTAssertEqual(model.doubleBookingTitle, TestCatalog(language)["sessions.doubleBooking.titleOwn"])
    }

    func test_F021_Design_leavingWithSomethingEnteredAsksFirst() async {
        let model = form(SessionFixtures.api())
        await model.start()
        XCTAssertFalse(model.isDirty)
        model.descriptionEn = "Gentle"
        XCTAssertTrue(model.isDirty)
        model.descriptionEn = ""
        XCTAssertFalse(model.isDirty)
        model.capacity = 20
        XCTAssertTrue(model.isDirty)
    }

    func test_F021_AC7_aTrainerWhoMayNotCreateClassesSeesTheNoPermissionText() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.location, with: .forbidden)
        let model = form(api)
        await model.start()
        XCTAssertEqual(model.load, .noPermission)
        XCTAssertFalse(model.canSave)
    }
}
