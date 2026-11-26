import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings

/// The workspace's word for the people who teach (F068, spec #588): the forms come from the generated catalog in the
/// interface language, with the results of `trainerWordForms` in packages/i18n (`trainer-word.test.ts`, AC5), which
/// these tests are named after. The test plan runs every test in nl and en.
final class TrainerWordFormsTests: XCTestCase {
    private typealias Word = Components.Schemas.TrainerWord

    /// The six forms in the order of the shared test: word, words, Word, Words, aWord, AWord.
    private struct Expected {
        let word: String
        let words: String
        let wordCap: String
        let wordsCap: String
        let aWord: String
        let aWordCap: String

        init(_ forms: [String]) {
            precondition(forms.count == 6)
            (word, words, wordCap, wordsCap, aWord, aWordCap) = (
                forms[0], forms[1], forms[2], forms[3], forms[4], forms[5]
            )
        }
    }

    /// The same table as `EXPECTED` in packages/i18n/src/trainer-word.test.ts, typed again here on purpose: the native
    /// resolution is checked against the words themselves, not against the catalog it reads.
    private static let expected: [Components.Schemas.Locale: [Word: Expected]] = [
        .nlNL: [
            .trainer: Expected(["trainer", "trainers", "Trainer", "Trainers", "een trainer", "Een trainer"]),
            .instructeur: Expected([
                "instructeur", "instructeurs", "Instructeur", "Instructeurs", "een instructeur", "Een instructeur"
            ]),
            .docent: Expected(["docent", "docenten", "Docent", "Docenten", "een docent", "Een docent"]),
            .coach: Expected(["coach", "coaches", "Coach", "Coaches", "een coach", "Een coach"])
        ],
        .en: [
            .trainer: Expected(["trainer", "trainers", "Trainer", "Trainers", "a trainer", "A trainer"]),
            .instructeur: Expected([
                "instructor", "instructors", "Instructor", "Instructors", "an instructor", "An instructor"
            ]),
            .docent: Expected(["teacher", "teachers", "Teacher", "Teachers", "a teacher", "A teacher"]),
            .coach: Expected(["coach", "coaches", "Coach", "Coaches", "a coach", "A coach"])
        ]
    ]

    func test_F068_AC5_everyFormOfEveryWordInBothLanguages() {
        for locale in [Components.Schemas.Locale.nlNL, .en] {
            let catalog = Catalog(locale: locale)
            for choice in [Word.trainer, .instructeur, .docent, .coach] {
                guard let expected = Self.expected[locale]?[choice] else { return XCTFail("no row for \(choice)") }
                let forms = TrainerWordForms(choice, catalog: catalog)
                let label = "\(choice.rawValue) in \(locale.rawValue)"
                XCTAssertEqual(forms.word, expected.word, label)
                XCTAssertEqual(forms.words, expected.words, label)
                XCTAssertEqual(forms.wordCap, expected.wordCap, label)
                XCTAssertEqual(forms.wordsCap, expected.wordsCap, label)
                XCTAssertEqual(forms.aWord, expected.aWord, label)
                XCTAssertEqual(forms.aWordCap, expected.aWordCap, label)
            }
        }
    }

    func test_F068_AC5_theSpecsExamplesReadCorrectly() {
        XCTAssertEqual(TrainerWordForms(.instructeur, catalog: Catalog(locale: .nlNL)).aWordCap, "Een instructeur")
        XCTAssertEqual(TrainerWordForms(.instructeur, catalog: Catalog(locale: .en)).aWordCap, "An instructor")
        XCTAssertEqual(TrainerWordForms(.docent, catalog: Catalog(locale: .en)).aWordCap, "A teacher")
        XCTAssertEqual(TrainerWordForms(.docent, catalog: Catalog(locale: .nlNL)).wordsCap, "Docenten")
    }

    func test_F068_everyWordHasItsFormsInTheInterfaceLanguage() {
        let language = TestCatalog.configuredLocale
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)
        for choice in [Word.trainer, .instructeur, .docent, .coach] {
            let forms = TrainerWordForms(choice, catalog: catalog)
            XCTAssertEqual(forms.word, expected["trainerWord.\(choice.rawValue).word"])
            XCTAssertEqual(forms.wordCap, expected["trainerWord.\(choice.rawValue).wordCap"])
            XCTAssertEqual(forms.aWord, expected["trainerWord.\(choice.rawValue).aWord"])
            XCTAssertFalse(forms.word.isEmpty)
        }
    }
}
