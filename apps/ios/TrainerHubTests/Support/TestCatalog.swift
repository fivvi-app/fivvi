import Foundation
import TrainerHubAPI

/// Expected copy, read from packages/i18n/generated/ios/Localizable.xcstrings compiled into this test bundle, so
/// tests never hard-code Dutch or English text.
struct TestCatalog {
    private let bundle: Bundle

    init(_ locale: Components.Schemas.Locale) {
        let tests = Bundle(for: BundleToken.self)
        let language = locale == .nlNL ? "nl" : "en"
        guard let path = tests.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path) else {
            fatalError("No \(language).lproj in the test bundle")
        }
        self.bundle = bundle
    }

    subscript(key: String) -> String {
        let text = bundle.localizedString(forKey: key, value: nil, table: nil)
        precondition(text != key, "\(key) is not in the catalog")
        return text
    }
}

private final class BundleToken {}
