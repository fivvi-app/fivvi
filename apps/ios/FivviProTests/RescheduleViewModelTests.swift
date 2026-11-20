import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// PS-05 *Sessie verplaatsen* (F020 AC6, AC8, iOS). The test plan runs every test in nl and en.
@MainActor
final class RescheduleViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private struct Setup {
        let api: StubAPI
        let session: Components.Schemas.Session
        let client: Components.Schemas.Client
    }

    private func setup(start: String = "2026-11-19", cancelled: Bool = false) -> Setup {
        let api = SessionFixtures.api()
        let anna = SessionFixtures.client(api, "Anna de Vries")
        let session = api.sessions.seed(
            client: anna, start: SessionFixtures.at(start, "09:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Owner"), cancelled: cancelled
        )
        return Setup(api: api, session: session, client: anna)
    }

    private func model(
        _ setup: Setup,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> RescheduleViewModel {
        RescheduleViewModel(
            api: setup.api, workspace: SessionFixtures.workspace, session: setup.session, clientName: setup.client.name,
            clientLocale: setup.client.chosenLocale, catalog: Catalog(locale: language), now: SessionFixtures.now,
            onForbidden: onForbidden
        )
    }

    func test_F020_AC6_theFormStartsWithTheSessionAndTheButtonSaysWhatHappens() {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let form = model(setup())
        let catalog = TestCatalog(language)
        XCTAssertEqual(form.time.localDate, "2026-11-19")
        XCTAssertEqual(form.time.localStart, "09:00")
        XCTAssertEqual(form.time.durationMinutes, 60)
        XCTAssertTrue(form.notify, "on for a session still to come")
        XCTAssertEqual(form.submitText, catalog["sessions.reschedule.submitNotify"])
        form.notify = false
        XCTAssertEqual(form.submitText, catalog["sessions.reschedule.submit"], "Verplaatsen without the email")
        XCTAssertEqual(
            form.notifyNote,
            String(
                format: catalog["sessions.reschedule.notifyNote"], "Anna de Vries",
                catalog["sessions.form.languageEn"]
            )
        )
        XCTAssertEqual(form.subtitle, String(format: catalog["sessions.reschedule.subtitle"], "Anna de Vries"))
        XCTAssertEqual(
            form.locationText, String(format: catalog["sessions.reschedule.locationUnchanged"], "John's Gym")
        )
    }

    func test_F020_AC6_aMoveWithNotifyAsksForTheEmailAndKeepsTheVersion() async throws {
        let ready = setup()
        let form = model(ready)
        form.time.start = SessionFixtures.at("2026-11-20", "10:30")
        form.time.durationChoice = 45

        let moved = await form.save()

        let sent = try XCTUnwrap(ready.api.sessions.moves.first)
        XCTAssertEqual(sent.sessionID, ready.session.id)
        XCTAssertEqual(sent.body.localDate, "2026-11-20")
        XCTAssertEqual(sent.body.localStart, "10:30")
        XCTAssertEqual(sent.body.durationMinutes, 45)
        XCTAssertTrue(sent.body.notify)
        XCTAssertEqual(sent.body.version, 1)
        XCTAssertEqual(sent.body.surface, .ios)
        XCTAssertEqual(moved?.version, 2)
        let format = form.time.format
        XCTAssertEqual(
            form.movedText(try XCTUnwrap(moved)),
            String(
                format: TestCatalog(language)["sessions.page.moved"], format.day(try XCTUnwrap(moved).startsAt), "10:30"
            )
        )
    }

    func test_F020_AC6_aMoveWithoutNotifyAsksForNoEmail() async {
        let ready = setup()
        let form = model(ready)
        form.notify = false
        form.time.start = SessionFixtures.at("2026-11-19", "11:00")

        _ = await form.save()

        XCTAssertEqual(ready.api.sessions.moves.first?.body.notify, false)
    }

    func test_F020_AC6_aSessionInThePastStartsWithNotifyOff() {
        let form = model(setup(start: "2026-11-02"))
        XCTAssertFalse(form.notify, "the API sends no email for a past time anyway")
    }

    func test_F020_AC8_aSessionChangedByAnotherShowsWhoAndTheNewValuesAndTheNextSaveWins() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .conflict(cancelled: false, changedBy: "Sarah Visser"))
        let form = model(ready)
        form.time.start = SessionFixtures.at("2026-11-21", "09:00")

        let first = await form.save()

        XCTAssertNil(first)
        XCTAssertEqual(form.failure, .changed(byName: "Sarah Visser"))
        XCTAssertEqual(
            form.failureText, String(format: TestCatalog(language)["sessions.reschedule.changedBy"], "Sarah Visser")
        )
        XCTAssertEqual(form.session.version, 2, "the session as it is now")
        XCTAssertEqual(form.time.localDate, "2026-11-19", "the form shows the values as they are now")

        ready.api.sessions.fail(.reschedule, with: nil)
        form.time.start = SessionFixtures.at("2026-11-21", "09:00")
        let second = await form.save()
        XCTAssertNotNil(second)
        XCTAssertEqual(ready.api.sessions.moves.last?.body.version, 2, "the next save uses the newest version")
    }

    func test_F020_AC8_aConflictWithoutAnameSaysThatTheSessionWasChanged() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .conflict(cancelled: false, changedBy: nil))
        let form = model(ready)
        _ = await form.save()
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.reschedule.changedByUnknown"])
    }

    func test_F020_AC8_aCancelledSessionCannotBeMoved() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .conflict(cancelled: true, changedBy: nil))
        let form = model(ready)
        _ = await form.save()
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.reschedule.cancelled"])

        let alreadyCancelled = model(setup(cancelled: true))
        let moved = await alreadyCancelled.save()
        XCTAssertNil(moved, "a cancelled session is not sent")
    }

    func test_F020_AC5_aStartTheClocksSkipIsWordedAsTheAPIRefusedIt() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .badRequest(path: "localStart", code: "time_does_not_exist"))
        let form = model(ready)
        _ = await form.save()
        XCTAssertEqual(form.time.refusal, .timeDoesNotExist)
        XCTAssertNotNil(form.time.refusalText)
        XCTAssertNil(form.failureText)
    }

    func test_F020_AC7_aRefusedPermissionSaysYouNoLongerHaveIt() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .forbidden)
        var refused: [WorkspaceCapabilities.Capability] = []
        let form = model(ready, onForbidden: { refused.append($0) })
        _ = await form.save()
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.reschedule.noPermission"])
        XCTAssertEqual(refused, [.session_private_manage_own])
    }

    func test_F020_AC6_aFailedMoveSaysNotSavedAndKeepsTheInput() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .offline)
        let form = model(ready)
        form.time.start = SessionFixtures.at("2026-11-22", "09:00")
        _ = await form.save()
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.form.errors.notSaved"])
        XCTAssertEqual(form.time.localDate, "2026-11-22")
    }

    /// PS-07 owns the answer to a clash with the trainer's own calendar; until then it is a plain "not saved".
    func test_F020_AC8_aTrainerConflictSaysNotSavedAndLeavesTheSessionAsItWas() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .trainerConflict)
        let form = model(ready)
        form.time.start = SessionFixtures.at("2026-11-22", "09:00")

        let moved = await form.save()

        XCTAssertNil(moved)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.form.errors.notSaved"])
        XCTAssertEqual(form.session.version, ready.session.version, "nothing was stored, so nothing is reloaded")
        XCTAssertEqual(form.session.startsAt, ready.session.startsAt)
        XCTAssertEqual(form.time.localDate, "2026-11-22", "the input is kept")
    }

    func test_F020_AC8_aConflictThatCarriesNoSessionSaysNotSavedAndLeavesTheSessionAsItWas() async {
        let ready = setup()
        ready.api.sessions.fail(.reschedule, with: .conflictWithoutSession)
        let form = model(ready)

        let moved = await form.save()

        XCTAssertNil(moved)
        XCTAssertEqual(form.failureText, TestCatalog(language)["sessions.form.errors.notSaved"])
        XCTAssertEqual(form.session.version, ready.session.version)
        XCTAssertEqual(form.session.startsAt, ready.session.startsAt)
    }
}
