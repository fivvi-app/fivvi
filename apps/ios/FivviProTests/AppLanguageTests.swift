import FivviAPI
import XCTest

@testable import FivviPro

/// F010: the language the app shows, the choice on this device and the account's stored preference. The device is
/// English unless a test says otherwise, whatever language the test plan runs in.
@MainActor
final class AppLanguageTests: XCTestCase {
    private let english = LanguageSources(perApp: nil, device: ["en-GB"])
    private let signedIn = InMemorySessionStore(token: "stored-token")

    private func appLanguage(
        _ api: StubAPI = StubAPI(), store: InMemorySessionStore? = nil, defaults: UserDefaults,
        sources: LanguageSources? = nil
    ) -> AppLanguage {
        AppLanguage(api: api, store: store ?? signedIn, defaults: defaults, sources: sources ?? english)
    }

    func test_F010_AC3_inAppSwitchRerendersAndSaves() async throws {
        let api = StubAPI()
        let language = appLanguage(api, defaults: try emptyDefaults())
        XCTAssertEqual(language.catalog.locale, .en)

        language.choose(.nlNL)

        XCTAssertEqual(language.catalog.locale, .nlNL, "the screen is in Dutch before the API has answered")
        XCTAssertEqual(language.catalog[.signInLanguageLabel], TestCatalog(.nlNL)["signIn.languageLabel"])
        await language.save()
        let saved = await api.savedLocales
        XCTAssertEqual(saved, [.nlNL])
        XCTAssertFalse(language.saveFailed)
    }

    func test_F010_AC3_theSaveNamesTheIosSurface() async throws {
        let api = StubAPI()
        let language = appLanguage(api, defaults: try emptyDefaults())

        language.choose(.nlNL)
        await language.save()

        let surfaces = await api.savedSurfaces
        let expected: [Components.Schemas.UpdateMeRequest.SurfacePayload?] = [.ios]
        XCTAssertEqual(surfaces, expected)
    }

    func test_F010_AC3_aFailedSaveIsTriedAgainAndNothingIsLost() async throws {
        let api = StubAPI()
        await api.answerUpdateMe(with: .offline)
        let language = appLanguage(api, defaults: try emptyDefaults())
        language.choose(.nlNL)

        await language.save()

        XCTAssertTrue(language.saveFailed)
        XCTAssertEqual(language.catalog.locale, .nlNL, "the screen keeps the choice")
        await api.answerUpdateMe(with: .accepted)
        await language.save()
        let saved = await api.savedLocales
        XCTAssertEqual(saved, [.nlNL, .nlNL])
        XCTAssertFalse(language.saveFailed)
        await language.save()
        let afterwards = await api.savedLocales
        XCTAssertEqual(afterwards.count, 2, "a saved choice is not saved again")
    }

    func test_F010_AC2_adoptsStoredPreferenceOnForeground() async throws {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "owner@example.com", preferredLocale: .nlNL))
        let language = appLanguage(api, defaults: try emptyDefaults())
        let account = AccountViewModel(
            api: api, store: signedIn, onAccount: { _ in }, onSignedOut: { _ in },
            onPreferredLocale: { language.startRead() }
        )
        XCTAssertEqual(language.catalog.locale, .en, "an English phone")

        await account.refresh()

        XCTAssertEqual(language.catalog.locale, .nlNL, "whatever the device language")
        await api.answerMe(with: .account(email: "owner@example.com", preferredLocale: .en))
        await account.refresh()
        XCTAssertEqual(language.catalog.locale, .en, "and again when it changes once more")
        let saved = await api.savedLocales
        XCTAssertEqual(saved, [], "adopting is not a new choice, nothing is saved")
    }

    func test_F010_AC2_aReadSentBeforeASaveButAnsweredAfterItDoesNotRevertTheScreen() async throws {
        let api = StubAPI()
        await api.answerMe(with: .hangThenTelling(.en))
        let language = appLanguage(api, defaults: try emptyDefaults())
        let account = AccountViewModel(
            api: api, store: signedIn, onAccount: { _ in }, onSignedOut: { _ in },
            onPreferredLocale: { language.startRead() }
        )
        let reading = Task { await account.refresh() }
        await api.untilMeHangs()

        language.choose(.nlNL)
        await language.save()
        await api.releaseHangingMes()
        await reading.value

        XCTAssertEqual(language.catalog.locale, .nlNL, "the old English answer predates the choice")
    }

    func test_F010_AC2_theAdoptedPreferenceReplacesTheOlderLocalChoice() throws {
        let defaults = try emptyDefaults()
        // An older choice on this phone, saved long ago.
        defaults.set("nl-NL", forKey: AppLanguage.choiceKey)
        let language = appLanguage(defaults: defaults)
        XCTAssertEqual(language.catalog.locale, .nlNL)

        language.adopt(stored: .en)

        XCTAssertEqual(language.catalog.locale, .en)
        XCTAssertEqual(appLanguage(defaults: defaults).catalog.locale, .en, "the next launch starts in it")
    }

    func test_F010_AC2_aChoiceWaitingToBeSavedIsNotOverriddenByTheOlderStoredPreference() throws {
        let language = appLanguage(defaults: try emptyDefaults())
        language.choose(.nlNL)

        language.adopt(stored: .en)

        XCTAssertEqual(language.catalog.locale, .nlNL)
    }

    func test_F010_AC4_signedOutChoiceKeptLocally() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        let signedOut = InMemorySessionStore()
        let language = appLanguage(api, store: signedOut, defaults: defaults)

        language.choose(.nlNL)
        await language.save()

        let saved = await api.savedLocales
        XCTAssertEqual(saved, [], "signed out there is no account to save it on")
        XCTAssertEqual(language.catalog.locale, .nlNL)
        // The phone keeps it: a new launch is in Dutch though the phone is English, and the sign-in email follows it.
        let relaunched = appLanguage(api, store: signedOut, defaults: defaults)
        XCTAssertEqual(relaunched.catalog.locale, .nlNL)
        let model = SignInViewModel(
            api: api, store: signedOut, catalog: relaunched.catalog, showsSignedOutNotice: false, onSignedIn: {},
            announce: { _ in }
        )
        model.email = "sarah@example.com"
        await model.requestCode()
        let requests = await api.signInRequests
        XCTAssertEqual(requests.map(\.locale), [.nlNL])
    }

    func test_F010_AC4_theChoiceMadeBeforeSigningInIsSavedAtSignIn() async throws {
        let api = StubAPI()
        let store = InMemorySessionStore()
        let language = appLanguage(api, store: store, defaults: try emptyDefaults())
        language.choose(.nlNL)
        try store.save(token: "new-token")

        await language.save()

        let saved = await api.savedLocales
        XCTAssertEqual(saved, [.nlNL])
    }

    func test_F010_AC6_signOut_theLanguageStaysUntilSomeoneChoosesAnother() async throws {
        let defaults = try emptyDefaults()
        let store = InMemorySessionStore(token: "stored-token")
        let language = appLanguage(store: store, defaults: defaults)
        language.choose(.nlNL)
        await language.save()

        store.deleteToken()

        XCTAssertEqual(language.catalog.locale, .nlNL)
        XCTAssertEqual(appLanguage(store: store, defaults: defaults).catalog.locale, .nlNL)
    }

    func test_F010_perAppLanguageChangedInSettingsIsANewChoiceThatIsSaved() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        let sources = LanguageSources(perApp: "nl", device: ["en-GB"])

        let launched = appLanguage(api, defaults: defaults, sources: sources)
        XCTAssertEqual(launched.catalog.locale, .nlNL)
        await launched.save()

        let saved = await api.savedLocales
        XCTAssertEqual(saved, [.nlNL])
        // The same Settings value at the next launch is not a new choice: the in-app choice since then wins.
        launched.choose(.en)
        await launched.save()
        let relaunched = appLanguage(api, defaults: defaults, sources: sources)
        XCTAssertEqual(relaunched.catalog.locale, .en)
        let all = await api.savedLocales
        XCTAssertEqual(all, [.nlNL, .en])
        // A new Settings value is.
        let changed = appLanguage(
            api, defaults: defaults, sources: LanguageSources(perApp: "en", device: ["en-GB"])
        )
        XCTAssertEqual(changed.catalog.locale, .en)
        let other = appLanguage(
            api, defaults: defaults, sources: LanguageSources(perApp: "nl-NL", device: ["en-GB"])
        )
        XCTAssertEqual(other.catalog.locale, .nlNL)
    }

    func test_F010_aChoiceWithoutAnyLocalStateFollowsTheDevice() throws {
        let dutch = LanguageSources(perApp: nil, device: ["nl-NL"])
        XCTAssertEqual(appLanguage(defaults: try emptyDefaults(), sources: dutch).catalog.locale, .nlNL)
        XCTAssertEqual(appLanguage(defaults: try emptyDefaults()).catalog.locale, .en)
    }
}
