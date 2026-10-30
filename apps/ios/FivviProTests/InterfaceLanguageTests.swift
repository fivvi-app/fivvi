import FivviAPI
import XCTest

@testable import FivviPro

/// ADR-017's interface language, mirroring `E008 AC3 interface language` in packages/i18n/src/locale.test.ts.
final class InterfaceLanguageTests: XCTestCase {
    func test_E008_AC3_unsupportedLanguageFallsBackToEnglish() {
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: [])), .en)
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["de-DE", "fr-FR"])), .en)
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: "fr", device: ["de"])), .en)
    }

    func test_E008_AC3_firstSupportedLanguageWins() {
        let cases: [([String], Components.Schemas.Locale)] = [
            (["fr-FR", "nl-BE"], .nlNL),
            (["de-DE", "en-GB", "nl-NL"], .en),
            (["nl"], .nlNL),
            (["en-US", "nl-NL"], .en),
            (["nl_NL"], .nlNL)
        ]
        for (device, locale) in cases {
            XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: device)), locale, "\(device)")
        }
    }

    func test_E008_AC3_perAppChoiceWins() {
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: "nl", device: ["de-DE"])), .nlNL)
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: "en", device: ["nl-NL"])), .en)
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: "fr", device: ["nl-BE"])), .nlNL)
    }
}

/// F010 AC6: one test per case of ADR-017's order, named as in `packages/i18n/src/locale.test.ts` (`AC6: explicit,
/// stored, device, English`).
final class InterfaceLanguageResolverTests: XCTestCase {
    func test_F010_AC6_explicit() {
        XCTAssertEqual(
            InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["nl-NL"], explicit: "en", stored: "nl-NL")),
            .en
        )
    }

    func test_F010_AC6_stored() {
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["nl-NL"], stored: "en")), .en)
        XCTAssertEqual(
            InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["en-GB"], stored: "nl-NL")), .nlNL
        )
    }

    func test_F010_AC6_device() {
        XCTAssertEqual(
            InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["fr-FR", "nl-BE", "en-GB"])), .nlNL
        )
    }

    func test_F010_AC6_english() {
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: ["de-DE"])), .en)
        XCTAssertEqual(InterfaceLanguage.resolve(LanguageSources(perApp: nil, device: [])), .en)
    }
}

/// Where the app reads its language sources on iOS.
final class LanguageSourcesTests: XCTestCase {
    private var domain = ""
    private var defaults: UserDefaults!

    override func setUp() {
        domain = "app.fivvi.pro.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: domain)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: domain)
    }

    func test_E008_AC3_perAppLanguageIsReadFromTheAppsOwnDefaults() {
        defaults.setPersistentDomain(["AppleLanguages": ["nl-NL", "de-DE"]], forName: domain)

        let sources = LanguageSources.system(defaults: defaults, appDomain: domain, device: ["de-DE"])

        XCTAssertEqual(sources, LanguageSources(perApp: "nl-NL", device: ["de-DE"]))
    }

    func test_E008_AC3_noPerAppLanguageLeavesTheDeviceList() {
        let sources = LanguageSources.system(defaults: defaults, appDomain: domain, device: ["fr-FR", "nl-BE"])

        XCTAssertEqual(sources, LanguageSources(perApp: nil, device: ["fr-FR", "nl-BE"]))
    }
}
