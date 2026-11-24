import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// PS-06 *Sessie annuleren?* (F026 AC1, AC1a, AC2, AC4, AC10, AC11, iOS). The test plan runs every test in nl and en.
@MainActor
final class CancelSessionViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private struct Setup {
        let api: StubAPI
        let session: Components.Schemas.Session
        let client: Components.Schemas.Client
    }

    private func setup(start: String = "2026-11-19", time: String = "09:00", cancelled: Bool = false) -> Setup {
        let api = SessionFixtures.api()
        let anna = SessionFixtures.client(api, "Anna de Vries")
        let session = api.sessions.seed(
            client: anna, start: SessionFixtures.at(start, time),
            trainer: .init(id: StubSessions.myMemberID, name: "Owner"), cancelled: cancelled
        )
        return Setup(api: api, session: session, client: anna)
    }

    private func model(
        _ setup: Setup, now: Date = SessionFixtures.now, canReschedule: Bool = true,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> CancelSessionViewModel {
        CancelSessionViewModel(
            api: setup.api, workspace: SessionFixtures.workspace, session: setup.session,
            clientName: setup.client.name, clientEmail: setup.client.email, clientLocale: setup.client.chosenLocale,
            canReschedule: canReschedule, catalog: Catalog(locale: language), now: now, onForbidden: onForbidden
        )
    }

    func test_F026_AC1a_withTheClientChosenTheDialogAsksForAnotherTimeFirst() {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let form = model(setup())
        let catalog = TestCatalog(language)
        XCTAssertEqual(form.initiator, .client, "De klant is the default")
        XCTAssertEqual(form.step, .nudge)
        XCTAssertEqual(form.nudgeQuestionText, catalog["sessions.cancel.nudgeQuestion"])
        XCTAssertEqual(form.nudgeRescheduleText, catalog["sessions.cancel.nudgeReschedule"])
        XCTAssertEqual(form.nudgeCancelAnywayText, catalog["sessions.cancel.nudgeCancelAnyway"])
        XCTAssertFalse(form.notify, "no email for the client's own cancellation")
        XCTAssertEqual(form.titleText, catalog["sessions.cancel.title"])
        XCTAssertEqual(form.backText, catalog["sessions.cancel.back"])
        XCTAssertEqual(form.submitText, catalog["sessions.cancel.submit"])
    }

    func test_F026_AC1a_cancellingAnywayShowsTheConfirmStepAndWijSkipsTheQuestion() {
        let form = model(setup())
        form.cancelAnyway()
        XCTAssertEqual(form.step, .confirm)
        XCTAssertFalse(form.notify)

        let wij = model(setup())
        wij.choose(.workspace)
        XCTAssertEqual(wij.step, .confirm, "Wij goes straight to the confirm step")
        XCTAssertTrue(wij.notify, "the email is on when the workspace cancels")
        wij.choose(.client)
        XCTAssertEqual(wij.step, .nudge)
        XCTAssertFalse(wij.notify, "and off again for De klant")
    }

    func test_F026_AC1a_withoutTheRightToMoveTheQuestionIsLeftOut() {
        let form = model(setup(), canReschedule: false)
        XCTAssertEqual(form.step, .confirm, "Verplaatsen is not on offer for someone who may not move sessions")
    }

    func test_F026_AC1_theClientsCancellationSendsTheInitiatorNoEmailAndTheVersion() async throws {
        let ready = setup()
        let form = model(ready)
        form.cancelAnyway()

        let cancelled = await form.cancel()

        let sent = try XCTUnwrap(ready.api.sessions.cancels.first)
        XCTAssertEqual(sent.sessionID, ready.session.id)
        XCTAssertEqual(sent.body.initiator, .client)
        XCTAssertFalse(sent.body.notify)
        XCTAssertEqual(sent.body.version, 1)
        XCTAssertEqual(sent.body.surface, .ios)
        XCTAssertEqual(cancelled?.status, .cancelled)
        XCTAssertEqual(cancelled?.cancellation?.initiator, .client)
    }

    func test_F026_AC2_theWorkspacesCancellationSendsTheEmailUnlessTheBoxIsOff() async throws {
        let ready = setup()
        let form = model(ready)
        form.choose(.workspace)
        _ = await form.cancel()
        XCTAssertEqual(ready.api.sessions.cancels.last?.body.initiator, .workspace)
        XCTAssertEqual(ready.api.sessions.cancels.last?.body.notify, true)

        let other = setup()
        let unchecked = model(other)
        unchecked.choose(.workspace)
        unchecked.notify = false
        _ = await unchecked.cancel()
        XCTAssertEqual(other.api.sessions.cancels.last?.body.notify, false, "unchecking the box sends nothing")
    }

    func test_F026_AC1_theNoteNamesTheAddressAndTheLanguageOfTheEmail() {
        let form = model(setup())
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            form.notifyNote,
            String(
                format: catalog["sessions.cancel.notifyNote"], "anna@example.com", catalog["sessions.form.languageEn"]
            ),
            "Anna writes English"
        )
        XCTAssertEqual(form.notifyText, String(format: catalog["sessions.cancel.notify"], "Anna de Vries"))
        XCTAssertEqual(
            form.subtitleText,
            String(
                format: catalog["sessions.cancel.subtitle"], "Anna de Vries",
                SessionFormat(locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam)
                    .day(form.session.startsAt),
                "10:00", "09:00"
            )
        )
    }

    func test_F026_AC1_aSessionThatHasStartedHasNoEmailBoxAndSendsNothing() async throws {
        let ready = setup(start: "2026-11-16", time: "08:00")
        let form = model(ready, now: SessionFixtures.at("2026-11-16", "08:30"))
        form.choose(.workspace)
        XCTAssertTrue(form.started)
        XCTAssertEqual(form.startedText, TestCatalog(language)["sessions.cancel.started"])

        _ = await form.cancel()

        XCTAssertEqual(ready.api.sessions.cancels.last?.body.notify, false, "whatever the box said")
    }

    func test_F026_AC11_aSessionChangedMeanwhileSaysWhoAndTheNextTryUsesTheNewVersion() async throws {
        let ready = setup()
        ready.api.sessions.fail(.cancel, with: .conflict(cancelled: false, changedBy: "Sarah Visser"))
        let form = model(ready)
        form.cancelAnyway()

        let first = await form.cancel()

        XCTAssertNil(first)
        XCTAssertEqual(
            form.failureText, String(format: TestCatalog(language)["sessions.cancel.changedBy"], "Sarah Visser")
        )
        XCTAssertEqual(form.session.version, 2, "the session as it is now")
        ready.api.sessions.fail(.cancel, with: nil)
        let second = await form.cancel()
        XCTAssertEqual(second?.status, .cancelled)
        XCTAssertEqual(ready.api.sessions.cancels.last?.body.version, 2)
        XCTAssertNil(form.failureText)
    }

    func test_F026_AC10_aSessionCancelledMeanwhileSaysSo() async {
        let ready = setup()
        ready.api.sessions.fail(.cancel, with: .conflict(cancelled: true, changedBy: nil))
        let form = model(ready)
        form.cancelAnyway()
        let cancelled = await form.cancel()
        XCTAssertNil(cancelled)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.cancel.alreadyCancelled"])
        XCTAssertFalse(form.canSubmit, "there is nothing left to cancel")
    }

    func test_F026_AC5_aRefusalSaysThePersonHasNoRightsAndAsksTheHelperToReload() async {
        let ready = setup()
        ready.api.sessions.fail(.cancel, with: .forbidden)
        var forbidden: [WorkspaceCapabilities.Capability] = []
        let form = model(ready) { forbidden.append($0) }
        form.cancelAnyway()

        let cancelled = await form.cancel()

        XCTAssertNil(cancelled)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.cancel.noPermission"])
        XCTAssertEqual(forbidden, [.session_private_cancel_own])
    }

    func test_F026_AC4_withoutAConnectionTheDialogSaysSoAndNothingIsQueued() async {
        let ready = setup()
        ready.api.sessions.fail(.cancel, with: .offline)
        let form = model(ready)
        form.cancelAnyway()

        let cancelled = await form.cancel()

        XCTAssertNil(cancelled)
        XCTAssertTrue(form.isOffline)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.cancel.offline"])
        XCTAssertFalse(form.canSubmit, "the button is off while offline")
    }

    func test_F026_AC4_anyOtherFailureSaysItWasNotSavedAndKeepsTheForm() async {
        let ready = setup()
        ready.api.sessions.fail(.cancel, with: .status(500))
        let form = model(ready)
        form.cancelAnyway()
        let cancelled = await form.cancel()
        XCTAssertNil(cancelled)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.form.errors.notSaved"])
        XCTAssertTrue(form.canSubmit, "it can be tried again")
    }

    func test_F026_AC10_aCancelledSessionIsNotSent() async {
        let ready = setup(cancelled: true)
        let form = model(ready)
        form.cancelAnyway()
        let cancelled = await form.cancel()
        XCTAssertNil(cancelled)
        XCTAssertTrue(ready.api.sessions.cancels.isEmpty)
    }
}
