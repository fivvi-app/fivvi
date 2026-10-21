import Foundation
import FivviAPI

@testable import FivviPro

/// Expected copy, read from packages/i18n/generated/ios/Localizable.xcstrings compiled into this test bundle, so
/// tests never hard-code Dutch or English text.
struct TestCatalog {
    private let bundle: Bundle

    init(_ locale: Components.Schemas.Locale) {
        let tests = Bundle(for: BundleToken.self)
        guard let path = tests.path(forResource: locale.lprojName, ofType: "lproj"),
              let bundle = Bundle(path: path)
        else {
            fatalError("No \(locale.lprojName).lproj in the test bundle")
        }
        self.bundle = bundle
    }

    /// The language of the test-plan configuration this test runs in, as FivviPro.xctestplan names it. Tests compare
    /// with it, so a configuration whose language doesn't reach the app fails instead of silently testing the other one.
    static var configuredLocale: Components.Schemas.Locale {
        switch ProcessInfo.processInfo.environment["FIVVI_TEST_LANGUAGE"] {
        case "nl": .nlNL
        case "en": .en
        default: fatalError("Run the tests through FivviPro.xctestplan, which sets FIVVI_TEST_LANGUAGE")
        }
    }

    subscript(key: String) -> String {
        let text = bundle.localizedString(forKey: key, value: nil, table: nil)
        precondition(text != key, "\(key) is not in the catalog")
        return text
    }
}

private final class BundleToken {}
