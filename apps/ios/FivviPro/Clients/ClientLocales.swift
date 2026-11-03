import FivviAPI

typealias ClientLocale = Components.Schemas.Locale

extension Catalog {
    /// A language named in the interface language: *Nederlands* / *Dutch*.
    func languageName(_ locale: ClientLocale) -> String {
        switch locale {
        case .nlNL: self[.clientsLanguageNameNl]
        case .en: self[.clientsLanguageNameEn]
        }
    }

    /// A language as its own people write it, for choosing it: *Nederlands*, *English*.
    func languageChoice(_ locale: ClientLocale) -> String {
        switch locale {
        case .nlNL: self[.clientsLocaleNl]
        case .en: self[.clientsLocaleEn]
        }
    }

    /// The language for a client's emails: the one the team set, or *Standaard (Nederlands)* while they follow the
    /// workspace's default.
    func emailLanguage(of client: Components.Schemas.Client, workspaceDefault: ClientLocale) -> String {
        guard let locale = client.chosenLocale else {
            return string(.clientsLocaleDefault, languageName(workspaceDefault))
        }
        return languageChoice(locale)
    }
}

extension Components.Schemas.Client {
    /// The language for this client's emails the team set, nil while they follow the workspace's default.
    var chosenLocale: ClientLocale? {
        emailLocale.flatMap { ClientLocale(rawValue: $0.rawValue) }
    }
}
