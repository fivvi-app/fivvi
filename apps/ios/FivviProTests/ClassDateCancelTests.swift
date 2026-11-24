import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 *Les annuleren* (F026 AC6, AC8, AC9 and the design of `DECISIONS.md` §3, iOS): the Owner's ⋯ menu, the native
/// confirmation that says how many booked clients get an email, the cancellation of this date only, and the cancelled
/// banner. The test plan runs every test in nl and en.
@MainActor
final class ClassDateCancelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    /// A date far enough ahead to be still to come whenever the tests run.
    private static let ahead = "2030-10-01"

    private func participants(_ count: Int) -> [Components.Schemas.SessionParticipant] {
        ["Anna de Vries", "Mark Jansen", "Lisa Smit"].prefix(count).enumerated().map { index, name in
            .init(clientId: "3f0b1c2e-8a54-4b51-9a42-00000000000\(index + 1)", name: name, attendanceStatus: .booked)
        }
    }

    /// Kracht on a date with `booked` participants, `days` from `day`.
    private func kracht(
        _ api: StubAPI, booked: Int = 3, day: String = ClassDateCancelTests.ahead, time: String = "18:00"
    ) -> Components.Schemas.Session {
        let trainer = Components.Schemas.SessionTrainer(id: StubSessions.otherMemberID, name: "Sarah Visser")
        let groupClass = api.classes.seed(nameNl: "Kracht", nameEn: "Strength", capacity: 8, trainer: trainer)
        return api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at(day, time), minutes: 60, capacity: 8, trainer: trainer,
            participants: participants(booked)
        )
    }

    private func screen(
        _ api: StubAPI, id: String, canManage: Bool = true, isOnline: @escaping @MainActor () -> Bool = { true },
        onCancelled: @escaping @MainActor () -> Void = {}
    ) -> ClassDateViewModel {
        ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: id, catalog: Catalog(locale: language),
            canManage: canManage, isOnline: isOnline, onCancelled: onCancelled
        )
    }

    func test_F026_Design_theOwnerHasLesAnnulerenInTheMenuAndATrainerHasNone() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let api = SessionFixtures.api()
        let date = kracht(api)
        let owner = screen(api, id: date.id)
        await owner.load()
        XCTAssertTrue(owner.canCancel)
        XCTAssertEqual(owner.cancelText, TestCatalog(language)["classes.cancel.action"], "Les annuleren / Cancel class")

        let trainer = screen(api, id: date.id, canManage: false)
        await trainer.load()
        XCTAssertFalse(trainer.canCancel, "Tom, a Trainer, has no Les annuleren")
        XCTAssertFalse(trainer.hasMenu)
    }

    func test_F026_Design_theConfirmationSaysHowManyBookedClientsGetAnEmail() async throws {
        let api = SessionFixtures.api()
        let date = kracht(api, booked: 3)
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertNil(model.cancelAsk)

        await model.askToCancel()

        let ask = try XCTUnwrap(model.cancelAsk)
        let catalog = TestCatalog(language)
        XCTAssertEqual(ask.participants, 3)
        XCTAssertEqual(model.cancelTitleText, catalog["classes.cancel.title"], "Les annuleren?")
        XCTAssertEqual(model.cancelMessageText, String(format: catalog["classes.app.cancelBody"], 3))
        XCTAssertFalse(model.cancelMessageText.contains("%"), model.cancelMessageText)
        XCTAssertEqual(model.cancelSubmitText, catalog["classes.cancel.submit"])
        XCTAssertEqual(model.cancelBackText, catalog["classes.cancel.back"], "Terug, never Annuleren")
        XCTAssertEqual(api.sessions.previews, [date.id])
    }

    func test_F026_Design_oneBookedClientGetsTheSingularWithoutANumber() async throws {
        let api = SessionFixtures.api()
        let date = kracht(api, booked: 1)
        let model = screen(api, id: date.id)
        await model.load()

        await model.askToCancel()

        XCTAssertEqual(model.cancelAsk?.participants, 1)
        XCTAssertEqual(model.cancelMessageText, String(format: TestCatalog(language)["classes.app.cancelBody"], 1))
        XCTAssertFalse(model.cancelMessageText.contains("1"), "the singular has no number: \(model.cancelMessageText)")
        XCTAssertFalse(model.cancelMessageText.contains("#"), model.cancelMessageText)
    }

    func test_F026_AC8_withoutParticipantsTheConfirmationSaysNobodyGetsAnEmail() async {
        let api = SessionFixtures.api()
        let date = kracht(api, booked: 0)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        XCTAssertEqual(model.cancelMessageText, TestCatalog(language)["classes.cancel.countNone"])
    }

    func test_F026_AC9_aDateThatHasStartedIsRecordedForTheRecordWithoutEmails() async {
        let api = SessionFixtures.api()
        let date = kracht(api, booked: 3, day: "2026-10-13")
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        XCTAssertEqual(model.cancelMessageText, TestCatalog(language)["classes.cancel.started"])
    }

    func test_F026_Design_cancellingSendsThisDateOnlyAndTheBannerShowsWhenAndBy() async throws {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()

        await model.confirmCancel()

        let sent = try XCTUnwrap(api.sessions.classCancels.first)
        XCTAssertEqual(sent.sessionID, date.id)
        XCTAssertEqual(sent.body.scope, .this, "Alleen deze les: the series and the message stay on the web")
        XCTAssertNil(sent.body.message)
        XCTAssertEqual(sent.body.version, 1)
        XCTAssertEqual(sent.body.surface, .ios)
        XCTAssertNil(model.cancelAsk, "the confirmation goes")
        XCTAssertTrue(model.isCancelled)
        XCTAssertFalse(model.hasMenu, "a cancelled date has no actions")

        let cancellation = try XCTUnwrap(model.session?.cancellation)
        let catalog = TestCatalog(language)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(
            model.cancelledText,
            String(
                format: catalog["classes.date.cancelledBanner"], format.day(cancellation.cancelledAt), "Owner",
                format.time(cancellation.cancelledAt)
            )
        )
    }

    func test_F026_Design_goingBackFromTheConfirmationCancelsNothing() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        model.dismissCancel()
        XCTAssertNil(model.cancelAsk)
        XCTAssertTrue(api.sessions.classCancels.isEmpty)
        XCTAssertFalse(model.isCancelled)
    }

    func test_F026_AC4_offlineLesAnnulerenIsOffAndSaysSo() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertNil(model.cancelOfflineText)

        api.sessions.fail(.preview, with: .offline)
        await model.askToCancel()

        XCTAssertNil(model.cancelAsk, "no confirmation without the preview: nothing is cancelled")
        XCTAssertTrue(model.isOffline)
        XCTAssertEqual(model.cancelOfflineText, TestCatalog(language)["classes.app.cancelOffline"])
        XCTAssertFalse(model.canStartCancel, "the item is off")

        api.sessions.fail(.preview, with: nil)
        await model.refresh()
        XCTAssertFalse(model.isOffline)
        XCTAssertTrue(model.canStartCancel)
    }

    func test_F026_AC4_theNetworkPathSayingOfflineTurnsLesAnnulerenOffBeforeAnyRequestFails() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        var online = false
        let model = screen(api, id: date.id, isOnline: { online })
        await model.load()

        XCTAssertEqual(model.state, .loaded, "the read worked: only the network path says offline")
        XCTAssertTrue(model.isOffline)
        XCTAssertFalse(model.canStartCancel)
        XCTAssertEqual(model.cancelOfflineText, TestCatalog(language)["classes.app.cancelOffline"])
        await model.askToCancel()
        XCTAssertTrue(api.sessions.previews.isEmpty, "nothing is asked of the API without a connection")
        XCTAssertNil(model.cancelAsk)

        online = true
        XCTAssertTrue(model.canStartCancel, "back online, Les annuleren is on again")
        XCTAssertNil(model.cancelOfflineText)
    }

    func test_F026_AC3_aCancelledDateTellsTheListsToReadAgain() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        var told = 0
        let model = screen(api, id: date.id, onCancelled: { told += 1 })
        await model.load()
        await model.askToCancel()
        XCTAssertEqual(told, 0)

        await model.confirmCancel()

        XCTAssertEqual(told, 1, "Vandaag and Agenda read the cancelled date")
    }

    func test_F026_AC4_aCancelThatCouldNotReachTheApiSaysItIsOffline() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        api.sessions.fail(.cancelClass, with: .offline)

        await model.confirmCancel()

        XCTAssertFalse(model.isCancelled)
        XCTAssertEqual(model.cancelOfflineText, TestCatalog(language)["classes.app.cancelOffline"])
    }

    func test_F026_AC11_aDateChangedMeanwhileSaysWhoAndIsShownAsItIsNow() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        api.sessions.fail(.cancelClass, with: .conflict(cancelled: false, changedBy: "Sarah Visser"))

        await model.confirmCancel()

        XCTAssertFalse(model.isCancelled)
        XCTAssertEqual(model.session?.version, 2)
        XCTAssertEqual(
            model.cancelFailureText, String(format: TestCatalog(language)["classes.cancel.changedBy"], "Sarah Visser")
        )
    }

    func test_F026_AC10_aDateCancelledMeanwhileSaysSo() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        api.sessions.fail(.cancelClass, with: .conflict(cancelled: true, changedBy: nil))

        await model.confirmCancel()

        XCTAssertTrue(model.isCancelled)
        XCTAssertEqual(model.cancelFailureText, TestCatalog(language)["classes.cancel.alreadyCancelled"])
    }

    func test_F026_AC5_aRefusalSaysThePersonMayNotCancelItAndAsksTheHelperToReload() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        var told: [WorkspaceCapabilities.Capability] = []
        let model = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: date.id, catalog: Catalog(locale: language),
            canManage: true, onForbidden: { told.append($0) }
        )
        await model.load()
        await model.askToCancel()
        api.sessions.fail(.cancelClass, with: .forbidden)

        await model.confirmCancel()

        XCTAssertEqual(model.cancelFailureText, TestCatalog(language)["classes.cancel.noPermission"])
        XCTAssertEqual(told, [.class_manage])
    }

    func test_F026_AC4_anyOtherFailureSaysItWasNotCancelled() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        api.sessions.fail(.cancelClass, with: .status(500))
        await model.confirmCancel()
        XCTAssertEqual(model.cancelFailureText, TestCatalog(language)["classes.cancel.notSaved"])
        XCTAssertFalse(model.isCancelled)
    }

    func test_F026_AC3_aCancelledDateShowsTheBannerOnLoadAndNoMenu() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let first = screen(api, id: date.id)
        await first.load()
        await first.askToCancel()
        await first.confirmCancel()
        let reopened = screen(api, id: date.id)
        await reopened.load()
        XCTAssertTrue(reopened.isCancelled)
        XCTAssertNotNil(reopened.cancelledText)
        XCTAssertFalse(reopened.hasMenu)
        XCTAssertNil(reopened.ownerNoteText, "nothing to manage on a cancelled date")
    }
}
