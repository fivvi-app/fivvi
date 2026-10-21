import Foundation
import FivviAPI

/// What iOS knows about the user's languages.
struct LanguageSources: Equatable {
    /// The per-app language chosen in iOS Settings, if any.
    var perApp: String?
    /// The device's preferred languages, most preferred first.
    var device: [String]
}

/// The language the app shows and sends to the API, by ADR-017's interface-language rule. It mirrors
/// `resolveInterfaceLanguage` in packages/i18n: the per-app language (the explicit choice), then the first supported
/// device language, then English. Never the bundle's resolved language: the catalogs' source is Dutch, so iOS's own
/// fallback would give Dutch to an unsupported device.
enum InterfaceLanguage {
    static func resolve(_ sources: LanguageSources) -> Components.Schemas.Locale {
        for tag in [sources.perApp].compactMap(\.self) + sources.device {
            if let locale = match(tag) { return locale }
        }
        return .en
    }

    /// Matches a language tag by its language subtag: any `nl-*` is `nl-NL`, any `en-*` is `en`.
    static func match(_ tag: String) -> Components.Schemas.Locale? {
        let language = tag.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first
        return Components.Schemas.Locale.allCases.first { locale in
            locale.rawValue.lowercased().split(separator: "-").first == language
        }
    }
}
