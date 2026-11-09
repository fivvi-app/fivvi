import Foundation
import FivviAPI
import FivviStringCatalogs

/// The generated string catalog (packages/i18n/generated/ios/Localizable.xcstrings) in one interface language.
///
/// It reads that language's `.lproj` directly instead of letting iOS pick one: the catalogs' source language is Dutch,
/// so iOS's own choice would show Dutch on a device whose languages we don't support (ADR-017).
///
/// The catalog is the resources of the package `FivviStringCatalogs` (packages/i18n), the one source of both iOS apps.
public struct Catalog: Sendable {
    public let locale: Components.Schemas.Locale
    private let table: Bundle

    public init(locale: Components.Schemas.Locale, bundle: Bundle = FivviStringCatalogs.bundle) {
        self.locale = locale
        guard let path = bundle.path(forResource: locale.lprojName, ofType: "lproj"),
              let table = Bundle(path: path)
        else {
            preconditionFailure("The string catalog bundle has no \(locale.lprojName).lproj")
        }
        self.table = table
    }

    /// The locale to format dates, times and numbers with: `en` formats as en-GB (packages/i18n/README.md).
    public var formattingLocale: Locale {
        switch locale {
        case .nlNL: Locale(identifier: "nl_NL")
        case .en: Locale(identifier: "en_GB")
        }
    }

    /// The text for an i18n key, or nil when the catalog doesn't have it.
    public func string(forKey key: String) -> String? {
        let missing = "\u{1}"
        let text = table.localizedString(forKey: key, value: missing, table: nil)
        return text == missing ? nil : text
    }

    /// The text for a key (a `StringKey` of this module or of the app).
    public subscript(key: StringKey) -> String {
        guard let text = string(forKey: key.rawValue) else {
            preconditionFailure("\(key.rawValue) is missing from Localizable.xcstrings")
        }
        return text
    }

    /// The text for a key whose message has placeholders (`%1$@`, in the order of the message's sorted names), filled
    /// with `arguments`.
    public func string(_ key: StringKey, _ arguments: any CVarArg...) -> String {
        String(format: self[key], locale: formattingLocale, arguments: arguments)
    }
}

extension Catalog: Equatable {
    /// Two catalogs are the same when they are in the same language.
    public static func == (lhs: Catalog, rhs: Catalog) -> Bool { lhs.locale == rhs.locale }
}

/// An i18n key (packages/i18n/{nl-NL,en}.json). This module declares the keys the shared screens use; an app adds its own
/// in an extension, `extension StringKey { static let clientsTitle = StringKey("clients.title") }`.
public struct StringKey: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) { self.rawValue = rawValue }

    public init(_ rawValue: String) { self.rawValue = rawValue }
}

extension StringKey {
    public static let commonLoading = StringKey("common.loading")
    public static let commonRetry = StringKey("common.retry")
    public static let commonCancel = StringKey("common.cancel")
    public static let signInLanguageLabel = StringKey("signIn.languageLabel")
    public static let signInLanguageNl = StringKey("signIn.languageNl")
    public static let signInLanguageEn = StringKey("signIn.languageEn")
    public static let signInTitle = StringKey("signIn.title")
    public static let signInEmailLabel = StringKey("signIn.emailLabel")
    public static let signInSendCode = StringKey("signIn.sendCode")
    public static let signInCheckEmailTitle = StringKey("signIn.checkEmailTitle")
    public static let signInCheckEmailBodyApp = StringKey("signIn.checkEmailBodyApp")
    public static let signInCodeLabel = StringKey("signIn.codeLabel")
    public static let signInCodeHelp = StringKey("signIn.codeHelp")
    public static let signInSubmitCode = StringKey("signIn.submitCode")
    public static let signInResend = StringKey("signIn.resend")
    public static let signInResent = StringKey("signIn.resent")
    public static let signInChangeEmail = StringKey("signIn.changeEmail")
    public static let signInSignedOutNotice = StringKey("signIn.signedOutNotice")
    public static let signInErrorsInvalidEmail = StringKey("signIn.errors.invalidEmail")
    public static let signInErrorsInvalidOrExpiredCode = StringKey("signIn.errors.invalidOrExpiredCode")
    public static let signInErrorsNoConnection = StringKey("signIn.errors.noConnection")
    public static let signInErrorsGeneric = StringKey("signIn.errors.generic")
    public static let commonLoadingSlow = StringKey("common.loadingSlow")
}

extension Components.Schemas.Locale {
    /// The catalog's localization folder for this locale: `nl.lproj` or `en.lproj`.
    var lprojName: String {
        switch self {
        case .nlNL: "nl"
        case .en: "en"
        }
    }
}
