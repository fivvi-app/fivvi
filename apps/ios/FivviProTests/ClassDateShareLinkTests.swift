import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 *Boekingslink delen* (F037 AC8, AC9 and the design of `DECISIONS.md` §3, iOS): the button below the booked
/// card and the first item of the Owner's ⋯ menu get or make the link of this class date in the visitor's language,
/// put its short URL on the clipboard and say so. John (Owner) and Sarah (Trainer) share Kracht on a date to come. The
/// test plan runs every test in nl and en.
@MainActor
final class ClassDateShareLinkTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    /// A date far enough ahead to be still to come whenever the tests run.
    private static let ahead = "2030-10-01"

    /// What the phone's clipboard holds, as the screen's `copy` writes it.
    private final class Clipboard {
        var strings: [String] = []
    }

    private func kracht(_ api: StubAPI, day: String = ClassDateShareLinkTests.ahead) -> Components.Schemas.Session {
        let trainer = Components.Schemas.SessionTrainer(id: StubSessions.otherMemberID, name: "Sarah Visser")
        let groupClass = api.classes.seed(nameNl: "Kracht", nameEn: "Strength", capacity: 8, trainer: trainer)
        return api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at(day, "18:00"), minutes: 60, capacity: 8, trainer: trainer
        )
    }

    private func screen(
        _ api: StubAPI, id: String, canManage: Bool = true, canShareLink: Bool = true, clipboard: Clipboard = .init(),
        isOnline: @escaping @MainActor () -> Bool = { true },
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> ClassDateViewModel {
        ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace, sessionID: id, catalog: Catalog(locale: language),
            canManage: canManage, canShareLink: canShareLink, isOnline: isOnline,
            copy: { clipboard.strings.append($0) }, onForbidden: onForbidden
        )
    }

    func test_F037_AC8_theOwnerTapsBoekingslinkDelenAndTheDatesShortLinkIsOnTheClipboard() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale)
        let api = SessionFixtures.api()
        let date = kracht(api)
        let clipboard = Clipboard()
        let model = screen(api, id: date.id, clipboard: clipboard)
        await model.load()
        XCTAssertTrue(model.showsShareLink)
        XCTAssertTrue(model.canTapShareLink)
        XCTAssertEqual(model.shareLinkText, TestCatalog(language)["classes.app.shareLink"])
        XCTAssertNil(model.shareLinkCopiedText, "nothing is copied before the tap")

        await model.shareLink()

        let sent = try XCTUnwrap(api.bookingLinks.requests.first)
        XCTAssertEqual(sent.scope, .session, "Eén les op een datum")
        XCTAssertEqual(sent.language, .visitor, "the visitor's language")
        XCTAssertEqual(sent.sessionId, date.id)
        XCTAssertEqual(sent.surface, .ios)
        XCTAssertNil(sent.groupClassId)
        let link = try XCTUnwrap(api.bookingLinks.links.first)
        XCTAssertEqual(clipboard.strings, [link.url])
        XCTAssertTrue(link.url.hasPrefix("https://fivvi.app/l/"), link.url)
        XCTAssertEqual(model.shareLinkCopiedText, TestCatalog(language)["classes.app.shareLinkCopied"])
        XCTAssertNil(model.shareLinkFailureText)
    }

    func test_F037_AC8_aSecondTapGivesTheSameLink() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let clipboard = Clipboard()
        let model = screen(api, id: date.id, clipboard: clipboard)
        await model.load()

        await model.shareLink()
        await model.shareLink()

        XCTAssertEqual(api.bookingLinks.requests.count, 2)
        XCTAssertEqual(api.bookingLinks.links.count, 1, "get-or-create: one link for the date")
        XCTAssertEqual(clipboard.strings.count, 2)
        XCTAssertEqual(Set(clipboard.strings).count, 1, "the same link both times")
        XCTAssertEqual(model.shareLinkCopiedText, TestCatalog(language)["classes.app.shareLinkCopied"])
    }

    func test_F037_AC9_aTrainerGetsTheSameLinkAndHasNoMenu() async throws {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let ownerClipboard = Clipboard()
        let owner = screen(api, id: date.id, clipboard: ownerClipboard)
        await owner.load()
        await owner.shareLink()

        let trainerClipboard = Clipboard()
        let trainer = screen(api, id: date.id, canManage: false, clipboard: trainerClipboard)
        await trainer.load()
        XCTAssertTrue(trainer.showsShareLink, "Sarah has Boekingslink delen below the booked card")
        await trainer.shareLink()

        XCTAssertEqual(trainerClipboard.strings, ownerClipboard.strings, "the same link as John's")
        XCTAssertEqual(api.bookingLinks.links.count, 1)
        XCTAssertFalse(trainer.hasMenu, "no ⋯ menu beyond what F021 gives a Trainer: none")
        XCTAssertFalse(trainer.showsShareLinkInMenu)
        XCTAssertEqual(trainer.shareLinkCopiedText, TestCatalog(language)["classes.app.shareLinkCopied"])
    }

    func test_F037_Design_theOwnersMenuHasBoekingslinkDelenAsItsFirstItem() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertTrue(model.hasMenu)
        XCTAssertTrue(model.showsShareLinkInMenu)
    }

    func test_F037_Unavailable_aCancelledDateHasNoBoekingslinkDelen() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.askToCancel()
        await model.confirmCancel()

        XCTAssertTrue(model.isCancelled)
        XCTAssertFalse(model.showsShareLink)
        XCTAssertFalse(model.showsShareLinkInMenu)
        await model.shareLink()
        XCTAssertTrue(api.bookingLinks.requests.isEmpty, "nothing is asked for a cancelled date")
    }

    func test_F037_Unavailable_aPastClassDateHasNoBoekingslinkDelen() async {
        let api = SessionFixtures.api()
        let date = kracht(api, day: "2026-10-13")
        let owner = screen(api, id: date.id)
        await owner.load()
        XCTAssertFalse(owner.showsShareLink)
        XCTAssertFalse(owner.showsShareLinkInMenu)
        XCTAssertTrue(owner.hasMenu, "the rest of the Owner's menu stays")
        let trainer = screen(api, id: date.id, canManage: false)
        await trainer.load()
        XCTAssertFalse(trainer.showsShareLink)

        await owner.shareLink()
        XCTAssertTrue(api.bookingLinks.requests.isEmpty)
    }

    func test_F037_Unavailable_aPrivateSessionHasNoBoekingslinkDelen() async {
        let api = SessionFixtures.api()
        let anna = SessionFixtures.client(api, "Anna de Vries")
        let session = api.sessions.seed(client: anna, start: SessionFixtures.at(Self.ahead, "09:00"))
        let model = screen(api, id: session.id)
        await model.load()
        XCTAssertFalse(model.showsShareLink)
        await model.shareLink()
        XCTAssertTrue(api.bookingLinks.requests.isEmpty)
    }

    func test_F037_Design_withoutTheCapabilityThereIsNoBoekingslinkDelen() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id, canShareLink: false)
        await model.load()
        XCTAssertFalse(model.showsShareLink)
        XCTAssertFalse(model.showsShareLinkInMenu)
    }

    func test_F037_Unavailable_offlineBoekingslinkDelenIsOffAndSaysSo() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let clipboard = Clipboard()
        var online = false
        let model = screen(api, id: date.id, clipboard: clipboard, isOnline: { online })
        await model.load()

        XCTAssertEqual(model.state, .loaded, "the read worked: only the network path says offline")
        XCTAssertTrue(model.showsShareLink)
        XCTAssertFalse(model.canTapShareLink, "the action is unavailable")
        XCTAssertEqual(model.shareLinkOfflineText, TestCatalog(language)["classes.app.shareLinkOffline"])
        await model.shareLink()
        XCTAssertTrue(api.bookingLinks.requests.isEmpty, "nothing is asked of the API, and nothing is queued")
        XCTAssertTrue(clipboard.strings.isEmpty)

        online = true
        XCTAssertTrue(model.canTapShareLink, "back online, the action is on again")
        XCTAssertNil(model.shareLinkOfflineText)
    }

    func test_F037_Unavailable_aRequestThatCouldNotReachTheApiSaysItIsOfflineAndQueuesNothing() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let clipboard = Clipboard()
        let model = screen(api, id: date.id, clipboard: clipboard)
        await model.load()
        api.bookingLinks.fail(with: .offline)

        await model.shareLink()

        XCTAssertTrue(clipboard.strings.isEmpty)
        XCTAssertNil(model.shareLinkCopiedText)
        XCTAssertFalse(model.canTapShareLink)
        XCTAssertEqual(model.shareLinkOfflineText, TestCatalog(language)["classes.app.shareLinkOffline"])
        XCTAssertEqual(api.bookingLinks.requests.count, 1, "not retried by the app")

        api.bookingLinks.fail(with: nil)
        await model.refresh()
        XCTAssertTrue(model.canTapShareLink)
        await model.shareLink()
        XCTAssertEqual(clipboard.strings.count, 1)
    }

    func test_F037_Design_aRefusalSaysThePersonMayNotAndAsksTheHelperToReload() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        var told: [WorkspaceCapabilities.Capability] = []
        let clipboard = Clipboard()
        let model = screen(api, id: date.id, clipboard: clipboard, onForbidden: { told.append($0) })
        await model.load()
        api.bookingLinks.fail(with: .forbidden)

        await model.shareLink()

        XCTAssertEqual(model.shareLinkFailureText, TestCatalog(language)["bookingLinks.errors.noPermission"])
        XCTAssertEqual(told, [.bookingLink_copy])
        XCTAssertTrue(clipboard.strings.isEmpty)
        XCTAssertNil(model.shareLinkCopiedText)
    }

    func test_F037_Design_anyOtherFailureSaysSomethingWentWrongAndAnEarlierCopiedMessageGoes() async {
        let api = SessionFixtures.api()
        let date = kracht(api)
        let model = screen(api, id: date.id)
        await model.load()
        await model.shareLink()
        XCTAssertNotNil(model.shareLinkCopiedText)
        api.bookingLinks.fail(with: .status(500))

        await model.shareLink()

        XCTAssertEqual(model.shareLinkFailureText, TestCatalog(language)["bookingLinks.errors.generic"])
        XCTAssertNil(model.shareLinkCopiedText, "the message of the first tap does not stay over a failed second one")
    }
}
