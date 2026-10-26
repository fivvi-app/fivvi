import Foundation
import FivviAPI

/// The generated string catalog (packages/i18n/generated/ios/Localizable.xcstrings) in one interface language.
///
/// It reads that language's `.lproj` directly instead of letting iOS pick one: the catalogs' source language is Dutch,
/// so iOS's own choice would show Dutch on a device whose languages we don't support (ADR-017).
struct Catalog: Sendable {
    let locale: Components.Schemas.Locale
    private let table: Bundle

    init(locale: Components.Schemas.Locale, bundle: Bundle = .main) {
        self.locale = locale
        guard let path = bundle.path(forResource: locale.lprojName, ofType: "lproj"),
              let table = Bundle(path: path)
        else {
            preconditionFailure("The app bundle has no \(locale.lprojName).lproj")
        }
        self.table = table
    }

    /// The locale to format dates, times and numbers with: `en` formats as en-GB (packages/i18n/README.md).
    var formattingLocale: Locale {
        switch locale {
        case .nlNL: Locale(identifier: "nl_NL")
        case .en: Locale(identifier: "en_GB")
        }
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

    /// The text for a key whose message has placeholders (`%1$@`, in the order of the message's sorted names), filled
    /// with `arguments`.
    func string(_ key: StringKey, _ arguments: any CVarArg...) -> String {
        String(format: self[key], locale: formattingLocale, arguments: arguments)
    }
}

/// The i18n keys the app uses directly (packages/i18n/{nl-NL,en}.json).
enum StringKey: String {
    case commonLoading = "common.loading"
    case commonRetry = "common.retry"
    case helloError = "hello.error"
    case homeSignedInAs = "home.signedInAs"
    case signOutLabel = "signOut.label"
    case signInTitle = "signIn.title"
    case signInEmailLabel = "signIn.emailLabel"
    case signInSendCode = "signIn.sendCode"
    case signInCheckEmailTitle = "signIn.checkEmailTitle"
    case signInCheckEmailBodyApp = "signIn.checkEmailBodyApp"
    case signInCodeLabel = "signIn.codeLabel"
    case signInCodeHelp = "signIn.codeHelp"
    case signInSubmitCode = "signIn.submitCode"
    case signInResend = "signIn.resend"
    case signInResent = "signIn.resent"
    case signInChangeEmail = "signIn.changeEmail"
    case signInSignedOutNotice = "signIn.signedOutNotice"
    case signInErrorsInvalidEmail = "signIn.errors.invalidEmail"
    case signInErrorsInvalidOrExpiredCode = "signIn.errors.invalidOrExpiredCode"
    case signInErrorsNoConnection = "signIn.errors.noConnection"
    case signInErrorsGeneric = "signIn.errors.generic"
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
