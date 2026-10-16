import Foundation

/// Expected copy, read from packages/i18n/generated/ios/Localizable.xcstrings compiled into this test bundle, so
/// tests never hard-code Dutch or English text.
struct TestCatalog {
    /// The API locale this catalog's language is requested with.
    let apiLocale: String
    private let bundle: Bundle

    /// `language` is "nl" or "en".
    init(_ language: String) {
        let tests = Bundle(for: BundleToken.self)
        guard let path = tests.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path) else {
            fatalError("No \(language).lproj in the test bundle")
        }
        self.bundle = bundle
        apiLocale = language == "nl" ? "nl-NL" : "en"
    }

    /// The language of the test-plan configuration this test runs in ("nl" or "en"), as TrainerHub.xctestplan names
    /// it. The app is launched in it, so a configuration can't silently test the other language.
    static var configuredLanguage: String {
        guard let language = ProcessInfo.processInfo.environment["TRAINER_HUB_TEST_LANGUAGE"] else {
            fatalError("Run the tests through TrainerHub.xctestplan, which sets TRAINER_HUB_TEST_LANGUAGE")
        }
        return language
    }

    /// The catalog of the test-plan configuration this test runs in.
    static var configured: TestCatalog { TestCatalog(configuredLanguage) }

    subscript(key: String) -> String {
        let text = bundle.localizedString(forKey: key, value: nil, table: nil)
        precondition(text != key, "\(key) is not in the catalog")
        return text
    }
}

private final class BundleToken {}
