import Foundation
import Observation
import FivviAPI

/// The language the app shows right now (F010, ADR-017): it re-renders at once when the person chooses another, and the
/// choice is the account's stored preference, which the web and the other devices follow.
///
/// - The **explicit** input is the choice made on this device: *Profiel → Taal*, the switch on TM-01 (signed out it is
///   kept on the phone only), or a change of the per-app language in *Settings → Fivvi Pro → Language*, which is read
///   at launch as a new choice because iOS has no API to set it from the app.
/// - A choice is **unsaved** until `PATCH /api/v1/me` has stored it; `save()` tries again at every opening of the home
///   and foreground, and a stored preference read meanwhile never overrides it.
/// - On foreground the stored preference is read with `GET /api/v1/me`; when it differs, the app adopts it and the
///   older local choice is replaced (`adopt(stored:)`).
@MainActor
@Observable
final class AppLanguage {
    /// Where the local choice, whether it is saved and the last per-app language seen are kept (`UserDefaults`).
    nonisolated static let choiceKey = "FivviLanguageChoice"
    nonisolated static let unsavedKey = "FivviLanguageChoiceUnsaved"
    nonisolated static let lastPerAppKey = "FivviLastPerAppLanguage"

    private(set) var catalog: Catalog
    /// The last save failed: *Profiel* says so until the next one succeeds.
    private(set) var saveFailed = false
    private let api: any APIProtocol
    private let store: any SessionStore
    private let defaults: UserDefaults
    private let bundle: Bundle
    private let device: [String]
    private let perApp: String?
    private var choice: Components.Schemas.Locale?
    private var stored: Components.Schemas.Locale?
    private var unsaved: Bool
    private var saving = false
    /// Counts the choices and the saves, so a read of the stored preference can tell that one happened meanwhile.
    private var revision = 0

    /// `sources` are what iOS tells at launch. A per-app language that differs from the one seen at the last launch is
    /// a new explicit choice: it becomes the local choice and is saved like one.
    init(
        api: any APIProtocol,
        store: any SessionStore,
        defaults: UserDefaults = .standard,
        sources: LanguageSources = .forLaunch(),
        bundle: Bundle = .main
    ) {
        self.api = api
        self.store = store
        self.defaults = defaults
        self.bundle = bundle
        device = sources.device
        perApp = sources.perApp
        var choice = defaults.string(forKey: Self.choiceKey).flatMap { InterfaceLanguage.match($0) }
        var unsaved = defaults.bool(forKey: Self.unsavedKey)
        if sources.perApp != defaults.string(forKey: Self.lastPerAppKey) {
            defaults.set(sources.perApp, forKey: Self.lastPerAppKey)
            if let changed = sources.perApp.flatMap({ InterfaceLanguage.match($0) }) {
                choice = changed
                unsaved = true
            }
        }
        self.choice = choice
        self.unsaved = unsaved && choice != nil
        catalog = Catalog(
            locale: Self.resolve(choice: choice, stored: nil, perApp: sources.perApp, device: sources.device),
            bundle: bundle
        )
        persist()
    }

    /// The person chose `locale` here: the screen re-renders in it now. Saving it is `save()`'s job, which the caller
    /// starts when the person is signed in.
    func choose(_ locale: Components.Schemas.Locale) {
        revision += 1
        choice = locale
        unsaved = true
        saveFailed = false
        persist()
        render()
    }

    /// Stores the unsaved choice on the account, if one is signed in; the choice stays unsaved when the API doesn't
    /// take it, so the next call tries again. A choice made while a request is under way is saved after it.
    func save() async {
        guard store.token != nil, !saving else { return }
        saving = true
        defer { saving = false }
        while unsaved, let target = choice, store.token != nil {
            do {
                switch try await api.updateMe(body: .json(.init(preferredLocale: .init(rawValue: target.rawValue)))) {
                case .ok:
                    revision += 1
                    stored = target
                    saveFailed = false
                    if choice == target {
                        unsaved = false
                        persist()
                    }
                default:
                    saveFailed = true
                    return
                }
            } catch {
                saveFailed = true
                return
            }
        }
    }

    /// Call when a `GET /api/v1/me` goes out; the handler it returns adopts the answer unless a choice or a save came
    /// in between, because that answer may predate it and would put the screen back.
    func startRead() -> StoredLocaleHandler {
        let mark = revision
        return { [weak self] stored in
            guard let self, self.revision == mark else { return }
            self.adopt(stored: stored)
        }
    }

    /// The account's stored preference, as `GET /api/v1/me` tells it. When it is another language than the one shown
    /// the app adopts it (AC2) and it replaces the older local choice, unless a choice of this device is still waiting
    /// to be saved: that one is newer.
    func adopt(stored preferred: Components.Schemas.Locale?) {
        guard !saving else { return }
        stored = preferred
        guard !unsaved, let preferred else { return }
        if preferred != catalog.locale || preferred != choice {
            choice = preferred
            persist()
            render()
        }
    }

    /// Forgets the local choice and the per-app language seen, for UI tests that start from a clean phone.
    nonisolated static func forgetChoice(defaults: UserDefaults = .standard) {
        for key in [choiceKey, unsavedKey, lastPerAppKey] { defaults.removeObject(forKey: key) }
    }

    private func render() {
        let locale = Self.resolve(choice: choice, stored: stored, perApp: perApp, device: device)
        if locale != catalog.locale { catalog = Catalog(locale: locale, bundle: bundle) }
    }

    private func persist() {
        defaults.set(choice?.rawValue, forKey: Self.choiceKey)
        defaults.set(unsaved, forKey: Self.unsavedKey)
    }

    private static func resolve(
        choice: Components.Schemas.Locale?, stored: Components.Schemas.Locale?, perApp: String?, device: [String]
    ) -> Components.Schemas.Locale {
        InterfaceLanguage.resolve(LanguageSources(
            perApp: perApp, device: device, explicit: choice?.rawValue, stored: stored?.rawValue
        ))
    }
}
