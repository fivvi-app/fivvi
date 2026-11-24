import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-02 with *Annuleren* (F026 AC3, AC4, iOS): who may cancel, the cancelled banner and the offline state. The test plan
/// runs every test in nl and en.
@MainActor
final class SessionCancelViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func model(
        _ api: StubAPI, id: String, memberID: String = StubSessions.myMemberID, cancelAny: Bool = false,
        cancelOwn: Bool = false, isOnline: @escaping @MainActor () -> Bool = { true },
        onCancelled: @escaping @MainActor () -> Void = {}
    ) -> SessionViewModel {
        SessionViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: id,
            catalog: Catalog(locale: language), canCancelAny: cancelAny, canCancelOwn: cancelOwn,
            isOnline: isOnline, onCancelled: onCancelled
        )
    }

    private func planned(
        _ api: StubAPI, trainer: Components.Schemas.SessionTrainer? = .init(id: StubSessions.myMemberID, name: "Owner")
    ) -> Components.Schemas.Session {
        api.sessions.seed(
            client: SessionFixtures.client(api, "Anna de Vries"), start: SessionFixtures.at("2026-11-19", "09:00"),
            trainer: trainer
        )
    }

    func test_F026_AC4_anOwnerCancelsAnySessionATrainerOnlyTheirOwn() async {
        let api = SessionFixtures.api()
        let mine = planned(api)
        let theirs = planned(api, trainer: .init(id: StubSessions.otherMemberID, name: "Sarah Visser"))

        let owner = model(api, id: theirs.id, cancelAny: true)
        await owner.load()
        XCTAssertTrue(owner.canCancel, "the Owner cancels every session")

        let trainerOwn = model(api, id: mine.id, cancelOwn: true)
        await trainerOwn.load()
        XCTAssertTrue(trainerOwn.canCancel, "a Trainer cancels their own")

        let trainerOther = model(api, id: theirs.id, cancelOwn: true)
        await trainerOther.load()
        XCTAssertFalse(trainerOther.canCancel, "Annuleren is hidden on someone else's session")

        let nobody = model(api, id: mine.id)
        await nobody.load()
        XCTAssertFalse(nobody.canCancel)
    }

    func test_F026_AC4_theCancelFormIsForAScheduledSessionOnlyAndKnowsTheClient() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id, cancelAny: true)
        await screen.load()
        let form = try XCTUnwrap(screen.cancelForm(now: SessionFixtures.now))
        XCTAssertEqual(form.clientName, "Anna de Vries")
        XCTAssertEqual(form.notifyNote.map { $0.hasPrefix("anna@example.com") }, true, "the address of the client")

        let cancelled = await form.cancel()
        screen.didCancel(try XCTUnwrap(cancelled))
        XCTAssertNil(screen.cancelForm(now: SessionFixtures.now), "a cancelled session is not cancelled again")
        XCTAssertFalse(screen.canCancel)
        XCTAssertNil(screen.rescheduleForm(), "nor moved")
    }

    func test_F026_AC3_theCancelledSessionSaysWhenByWhomAndAtTheClientsRequest() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id, cancelAny: true)
        await screen.load()
        let form = try XCTUnwrap(screen.cancelForm(now: SessionFixtures.now))
        form.cancelAnyway()
        let stored = await form.cancel()
        screen.didCancel(try XCTUnwrap(stored))

        let catalog = TestCatalog(language)
        let cancelled = try XCTUnwrap(screen.session?.cancellation)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        let banner = String(
            format: catalog["sessions.page.cancelledBanner"], format.day(cancelled.cancelledAt), "Owner",
            format.time(cancelled.cancelledAt)
        )
        XCTAssertEqual(screen.cancelledText, "\(banner) · \(catalog["sessions.page.cancelledByClient"])")
        XCTAssertEqual(screen.cancelledDoneText, catalog["sessions.cancel.done"])
        XCTAssertTrue(screen.isCancelled)
    }

    func test_F026_AC3_aCancellationByTheWorkspaceHasNoSuffixAndAnUnknownPersonIsLeftOut() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id, cancelAny: true)
        await screen.load()
        let form = try XCTUnwrap(screen.cancelForm(now: SessionFixtures.now))
        form.choose(.workspace)
        let cancelled = await form.cancel()
        screen.didCancel(try XCTUnwrap(cancelled))

        let catalog = TestCatalog(language)
        XCTAssertFalse(
            screen.cancelledText.contains(catalog["sessions.page.cancelledByClient"]), "no suffix for Wij"
        )

        var unknown = try XCTUnwrap(screen.session)
        unknown.cancellation?.cancelledBy = nil
        screen.didCancel(unknown)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        let cancelledAt = try XCTUnwrap(unknown.cancellation?.cancelledAt)
        XCTAssertEqual(
            screen.cancelledText,
            String(
                format: catalog["sessions.page.cancelledBannerUnknown"], format.day(cancelledAt),
                format.time(cancelledAt)
            )
        )
    }

    func test_F026_AC4_offlineTheCancelItemIsOffAndSaysSoUntilTheNextReadWorks() async {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id, cancelAny: true)
        await screen.load()
        XCTAssertFalse(screen.isOffline)
        XCTAssertNil(screen.cancelOfflineText)

        api.sessions.fail(.get, with: .offline)
        await screen.refresh()
        XCTAssertTrue(screen.isOffline)
        XCTAssertEqual(screen.cancelOfflineText, TestCatalog(language)["sessions.cancel.offline"])
        XCTAssertEqual(screen.state, .loaded, "what was shown stays")

        api.sessions.fail(.get, with: nil)
        await screen.refresh()
        XCTAssertFalse(screen.isOffline)
        XCTAssertNil(screen.cancelOfflineText)
    }

    func test_F026_AC4_theNetworkPathSayingOfflineTurnsTheCancelItemOffBeforeAnyRequestFails() async {
        let api = SessionFixtures.api()
        let session = planned(api)
        var online = false
        let screen = model(api, id: session.id, cancelAny: true, isOnline: { online })
        await screen.load()

        XCTAssertEqual(screen.state, .loaded, "the read worked: only the network path says offline")
        XCTAssertTrue(screen.isOffline)
        XCTAssertEqual(screen.cancelOfflineText, TestCatalog(language)["sessions.cancel.offline"])

        online = true
        XCTAssertFalse(screen.isOffline, "back online, Annuleren is on again")
        XCTAssertNil(screen.cancelOfflineText)
    }

    func test_F026_AC3_aCancellationTellsTheListsToReadAgain() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        var told = 0
        let screen = model(api, id: session.id, cancelAny: true, onCancelled: { told += 1 })
        await screen.load()
        let form = try XCTUnwrap(screen.cancelForm(now: SessionFixtures.now))
        XCTAssertEqual(told, 0, "nothing is cancelled yet")

        let cancelled = await form.cancel()
        screen.didCancel(try XCTUnwrap(cancelled))

        XCTAssertEqual(told, 1, "Vandaag and Agenda read the cancelled session")
    }

    func test_F026_AC4_aCancelThatCouldNotReachTheApiMarksTheScreenOffline() async throws {
        let api = SessionFixtures.api()
        let session = planned(api)
        let screen = model(api, id: session.id, cancelAny: true)
        await screen.load()
        screen.cancelWasOffline()
        XCTAssertTrue(screen.isOffline)
        XCTAssertNotNil(screen.cancelOfflineText)
    }
}
