import Foundation
import FivviAPI

/// What iOS knows about the user's languages.
struct LanguageSources: Equatable {
    /// The per-app language chosen in iOS Settings, if any.
    var perApp: String?
    /// The device's preferred languages, most preferred first.
    var device: [String]
    /// A choice made in the app, on this device (F010): the explicit input.
    var explicit: String?
    /// The account's stored preference (`preferredLocale`), once the API has told.
    var stored: String?

    init(perApp: String?, device: [String], explicit: String? = nil, stored: String? = nil) {
        self.perApp = perApp
        self.device = device
        self.explicit = explicit
        self.stored = stored
    }
}

/// The language the app shows and sends to the API, by ADR-017's interface-language rule. It mirrors
/// `resolveInterfaceLanguage` in packages/i18n: the explicit choice (made in the app), then the account's stored
/// preference, then the per-app language of iOS Settings, then the first supported device language, then English.
/// Never the bundle's resolved language: the catalogs' source is Dutch, so iOS's own fallback would give Dutch to an
/// unsupported device.
enum InterfaceLanguage {
    static func resolve(_ sources: LanguageSources) -> Components.Schemas.Locale {
        for tag in [sources.explicit, sources.stored, sources.perApp].compactMap(\.self) + sources.device {
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
