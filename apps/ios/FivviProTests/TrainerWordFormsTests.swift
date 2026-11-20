import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings

/// The workspace's word for the people who teach (F068, iOS): the forms come from the generated catalog in the
/// interface language, as `trainerWordForms` gives them on the web. The test plan runs every test in nl and en.
final class TrainerWordFormsTests: XCTestCase {
    func test_F068_everyWordHasItsFormsInTheInterfaceLanguage() {
        let language = TestCatalog.configuredLocale
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)
        for choice in [Components.Schemas.TrainerWord.trainer, .instructeur, .docent, .coach] {
            let forms = TrainerWordForms(choice, catalog: catalog)
            XCTAssertEqual(forms.word, expected["trainerWord.\(choice.rawValue).word"])
            XCTAssertEqual(forms.wordCap, expected["trainerWord.\(choice.rawValue).wordCap"])
            XCTAssertEqual(forms.aWord, expected["trainerWord.\(choice.rawValue).aWord"])
            XCTAssertFalse(forms.word.isEmpty)
        }
        XCTAssertEqual(
            TrainerWordForms(.instructeur, catalog: Catalog(locale: .nlNL)).aWord, "een instructeur"
        )
        XCTAssertEqual(TrainerWordForms(.instructeur, catalog: Catalog(locale: .en)).aWord, "an instructor")
    }
}
