import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10, iOS): the form collects, the API plans. The test plan runs every
/// test in nl and en (FivviPro.xctestplan).
@MainActor
final class NewSessionViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func form(
        _ api: StubAPI, forAnyTrainer: Bool = false, email: String = "sarah@example.com",
        name: String? = "Sarah Visser",
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> NewSessionViewModel {
        NewSessionViewModel(
            api: api, workspace: SessionFixtures.workspace, catalog: Catalog(locale: language),
            forAnyTrainer: forAnyTrainer, email: email, accountName: name, now: SessionFixtures.now,
            onForbidden: onForbidden
        )
    }

    func test_F020_AC1_aTrainerPlansForThemselfAndTheRequestHasTheFormsValues() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        XCTAssertEqual(model.load, .ready)
        XCTAssertEqual(model.locationName, "John's Gym")
        XCTAssertEqual(model.time.localDate, "2026-11-16", "today")
        XCTAssertEqual(model.time.localStart, "09:00", "the next full hour")
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNotNil(planned)
        let sent = try XCTUnwrap(api.sessions.plans.first)
        XCTAssertEqual(sent.clientId, model.client?.id)
        XCTAssertNil(sent.trainerId, "a Trainer plans for themself and sends none (AC2)")
        XCTAssertEqual(sent.localDate, "2026-11-16")
        XCTAssertEqual(sent.localStart, "09:00")
        XCTAssertEqual(sent.durationMinutes, 60)
        XCTAssertTrue(sent.notify)
        XCTAssertEqual(sent.surface, .ios)
        XCTAssertEqual(planned?.participants.first?.name, "Anna de Vries")
        let catalog = TestCatalog(language)
        XCTAssertEqual(model.ownTrainerText, String(format: catalog["sessions.form.trainerMe"], "Sarah Visser"))
    }

    func test_F020_AC2_anOwnerSeesAllTrainersStartsOnTheirOwnPlaceAndMayChooseAnother() async throws {
        let api = SessionFixtures.api()
        let model = form(api, forAnyTrainer: true, email: "Owner@Example.com", name: "Owner")
        await model.start()
        XCTAssertEqual(model.trainers.map(\.name), ["Owner", "Sarah Visser"], "every trainer of the workspace")
        XCTAssertEqual(model.myTrainerID, StubSessions.myMemberID, "found by their email address, whatever its case")
        XCTAssertEqual(model.trainerID, StubSessions.myMemberID)
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            model.trainerText(model.trainers[0]), String(format: catalog["sessions.form.trainerMe"], "Owner"),
            "(ik) / (me)"
        )
        XCTAssertEqual(model.trainerText(model.trainers[1]), "Sarah Visser")

        model.client = SessionFixtures.client(api, "Mark Jansen")
        model.trainerID = StubSessions.otherMemberID
        _ = await model.save()

        XCTAssertEqual(api.sessions.plans.first?.trainerId, StubSessions.otherMemberID)
    }

    func test_F020_AC2_anOwnerWhoDoesNotTrainMustChooseATrainerFirst() async {
        let api = SessionFixtures.api()
        api.sessions.setTrainers([.init(id: StubSessions.otherMemberID, name: "Sarah Visser")], members: [])
        let model = form(api, forAnyTrainer: true, email: "owner@example.com")
        await model.start()
        XCTAssertEqual(model.trainerID, "", "no place of their own among the trainers")
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNil(planned)
        XCTAssertEqual(api.sessions.plans.count, 0, "nothing is sent")
        let words = TrainerWordForms(.trainer, catalog: Catalog(locale: language))
        XCTAssertEqual(
            model.trainerErrorText,
            String(format: TestCatalog(language)["sessions.form.errors.chooseTrainer"], words.aWord)
        )
    }

    func test_F020_AC1_aSaveWithoutAClientAsksForOne() async {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()

        let planned = await model.save()

        XCTAssertNil(planned)
        XCTAssertEqual(model.clientErrorText, TestCatalog(language)["sessions.form.errors.chooseClient"])
        XCTAssertEqual(api.sessions.plans.count, 0)
    }

    func test_F020_AC10_withoutAConnectionTheFormSaysSoAndSavingIsOffAndNothingIsQueued() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.location, with: .offline)
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        XCTAssertEqual(model.load, .offline)
        XCTAssertEqual(model.offlineText, TestCatalog(language)["sessions.form.offline"])
        XCTAssertFalse(model.canSave, "Opslaan is off")
        let planned = await model.save()
        XCTAssertNil(planned)
        XCTAssertEqual(api.sessions.plans.count, 0, "nothing is queued")

        api.sessions.fail(.location, with: nil)
        await model.start()
        XCTAssertTrue(model.canSave, "back online it can save again")
        XCTAssertNil(model.offlineText)
    }

    func test_F020_AC10_aSaveThatCouldNotReachTheAPISaysOfflineAndKeepsTheInput() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.plan, with: .offline)
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNil(planned)
        XCTAssertEqual(model.offlineText, TestCatalog(language)["sessions.form.offline"])
        XCTAssertNil(model.saveFailureText, "offline is not 'not saved'")
        XCTAssertFalse(model.canSave, "Opslaan is off")
        XCTAssertNotNil(model.client, "what was typed stays")

        api.sessions.fail(.plan, with: nil)
        await model.start()
        XCTAssertTrue(model.canSave, "Opnieuw proberen reads again and the form can save")
        XCTAssertNotNil(model.client)
    }

    func test_F020_AC5_aStartTheClocksSkipIsWordedAsTheAPIRefusedItAndTheInputStays() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.plan, with: .badRequest(path: "localStart", code: "time_does_not_exist"))
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        let planned = await model.save()

        XCTAssertNil(planned)
        XCTAssertEqual(model.time.refusal, .timeDoesNotExist)
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            model.time.refusalText,
            String(format: catalog["sessions.form.errors.timeDoesNotExist"], model.time.format.day(model.time.start))
        )
        XCTAssertNotNil(model.client, "what was typed stays")
        XCTAssertNil(model.saveFailureText)
    }

    func test_F020_AC4_aDateThatDoesNotExistIsWordedAsTheAPIRefusedIt() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.plan, with: .badRequest(path: "localDate", code: "invalid"))
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")
        _ = await model.save()
        XCTAssertEqual(model.time.refusalText, TestCatalog(language)["sessions.form.errors.invalidDate"])
    }

    func test_F020_AC7_aRefusedPermissionSaysSoAndHidesTheAction() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.plan, with: .forbidden)
        var refused: [WorkspaceCapabilities.Capability] = []
        let model = form(api, onForbidden: { refused.append($0) })
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        _ = await model.save()

        XCTAssertEqual(model.saveFailure, .noPermission)
        XCTAssertEqual(model.saveFailureText, TestCatalog(language)["sessions.form.errors.noPermission"])
        XCTAssertEqual(refused, [.session_private_manage_own])
    }

    func test_F020_AC1_anyOtherFailureKeepsTheInputAndSaysItWasNotSaved() async {
        let api = SessionFixtures.api()
        api.sessions.fail(.plan, with: .status(500))
        let model = form(api)
        await model.start()
        model.client = SessionFixtures.client(api, "Anna de Vries")

        _ = await model.save()

        XCTAssertEqual(model.saveFailureText, TestCatalog(language)["sessions.form.errors.notSaved"])
        XCTAssertNotNil(model.client)
        XCTAssertTrue(model.canSave, "it can be tried again")
    }

    func test_F020_AC1_theConfirmationNoteNamesTheAddressAndTheClientsLanguage() async {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        let catalog = TestCatalog(language)
        XCTAssertNil(model.notifyNote, "no client, no note")

        model.client = SessionFixtures.client(api, "Anna de Vries")
        XCTAssertEqual(
            model.notifyNote,
            String(
                format: catalog["sessions.form.notifyNote"], "anna@example.com", catalog["sessions.form.languageEn"]
            )
        )
        model.client = SessionFixtures.client(api, "Mark Jansen")
        XCTAssertEqual(
            model.notifyNote,
            String(
                format: catalog["sessions.form.notifyNote"], "mark@example.com", catalog["sessions.form.languageNl"]
            ),
            "the workspace's default"
        )

        model.notify = false
        model.client = SessionFixtures.client(api, "Anna de Vries")
        _ = await model.save()
        XCTAssertEqual(api.sessions.plans.first?.notify, false)
    }

    func test_F020_AC1_theLengthsAreTheButtonsOrAnyOtherFromTheList() async {
        let api = SessionFixtures.api()
        let model = form(api)
        XCTAssertEqual(model.time.durationChoice, 60)
        model.time.durationChoice = 90
        XCTAssertEqual(model.time.durationMinutes, 90)
        XCTAssertFalse(model.time.showsOtherDurations)
        model.time.durationChoice = 0
        XCTAssertTrue(model.time.showsOtherDurations, "Andere duur")
        model.time.durationMinutes = 50
        XCTAssertEqual(model.time.durationChoice, 0)
        XCTAssertEqual(SessionTimeFields.otherDurations.first, 15)
        XCTAssertEqual(SessionTimeFields.otherDurations.last, 240)
        XCTAssertEqual(SessionTimeFields.otherDurations.count, 46, "15 to 240 in steps of 5")

        let catalog = TestCatalog(language)
        model.time.start = SessionFixtures.at("2026-11-16", "23:30")
        model.time.durationChoice = 60
        XCTAssertEqual(model.time.endsAtText, String(format: catalog["sessions.form.endsAtNextDay"], "00:30"))
        model.time.start = SessionFixtures.at("2026-11-16", "09:00")
        XCTAssertEqual(model.time.endsAtText, String(format: catalog["sessions.form.endsAt"], "10:00"))
    }

    func test_F020_AC1_leavingAsksOnlyOnceSomethingWasEntered() async {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        XCTAssertFalse(model.isDirty)
        model.client = SessionFixtures.client(api, "Anna de Vries")
        XCTAssertTrue(model.isDirty, "the discard confirmation")
    }
}
