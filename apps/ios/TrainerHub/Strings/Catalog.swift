import Foundation
import TrainerHubAPI

/// The generated string catalog (packages/i18n/generated/ios/Localizable.xcstrings) in one interface language.
///
/// It reads that language's `.lproj` directly instead of letting iOS pick one: the catalogs' source language is Dutch,
/// so iOS's own choice would show Dutch on a device whose languages we don't support (ADR-017).
struct Catalog: Sendable {
    let locale: Components.Schemas.Locale
    private let table: Bundle

    init(locale: Components.Schemas.Locale, bundle: Bundle = .main) {
        self.locale = locale
        let language = locale == .nlNL ? "nl" : "en"
        guard let path = bundle.path(forResource: language, ofType: "lproj"), let table = Bundle(path: path) else {
            preconditionFailure("The app bundle has no \(language).lproj")
        }
        self.table = table
    }

    /// The text for an i18n key, or nil when the catalog doesn't have it.
    func string(forKey key: String) -> String? {
        let missing = "\u{1}"
        let text = table.localizedString(forKey: key, value: missing, table: nil)
        return text == missing ? nil : text
    }

    /// The text for a key the app itself uses.
    subscript(key: StringKey) -> String {
        guard let text = string(forKey: key.rawValue) else {
            preconditionFailure("\(key.rawValue) is missing from Localizable.xcstrings")
        }
        return text
    }
}

/// The i18n keys the app uses directly (packages/i18n/{nl-NL,en}.json).
enum StringKey: String, CaseIterable {
    case commonLoading = "common.loading"
    case commonRetry = "common.retry"
    case helloError = "hello.error"
}
