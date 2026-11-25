import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-05 *Nieuwe groepsles*, the *Niveau* field (F067 AC1, iOS): *Geen* to start with, the four levels, sent with the
/// quick create. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class NewGroupClassLevelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func form(_ api: StubAPI) -> NewGroupClassViewModel {
        NewGroupClassViewModel(
            api: api, workspace: SessionFixtures.workspace(as: StubSessions.myMemberID),
            catalog: Catalog(locale: language), email: "owner@example.com", accountName: "Owner",
            now: SessionFixtures.now
        )
    }

    func test_F067_AC1_theFieldIsNiveauWithGeenFirstThenTheFourLevelsInTheViewersLanguage() async {
        let catalog = TestCatalog(language)
        let model = form(SessionFixtures.api())
        XCTAssertEqual(model.levelLabel, catalog["classLevel.field"])
        XCTAssertNil(model.level, "Geen is the starting value")
        XCTAssertEqual(
            model.levelOptions.map(\.text),
            [
                catalog["classLevel.none"], catalog["classLevel.allLevels"], catalog["classLevel.beginner"],
                catalog["classLevel.intermediate"], catalog["classLevel.advanced"]
            ]
        )
        XCTAssertEqual(model.levelOptions.map(\.level), [nil, .allLevels, .beginner, .intermediate, .advanced])
    }

    func test_F067_AC1_johnAddsReformerPowerWithGevorderdAndTheClassAndItsDateCarryIt() async throws {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Reformer Power"
        model.level = .advanced

        let date = await model.save()

        XCTAssertEqual(api.classes.creates.first?.level, .advanced)
        XCTAssertEqual(api.classes.all.first?.level, .advanced, "the class has it")
        XCTAssertEqual(date?.level, .advanced, "so does the date TD-03 opens")
    }

    func test_F067_AC1_aWeeklyClassSendsTheLevelAndEveryDateCarriesIt() async throws {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Reformer Power"
        model.level = .beginner
        model.repeatsWeekly = true

        _ = await model.save()

        XCTAssertEqual(api.classes.creates.first?.level, .beginner)
        XCTAssertEqual(model.datesAdded, 12)
        let levels = api.sessions.all.filter { $0._type == .group }.map(\.level)
        XCTAssertEqual(levels, Array(repeating: .beginner, count: 12))
    }

    func test_F067_AC7_geenSendsNoLevelAndNothingIsStored() async throws {
        let api = SessionFixtures.api()
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"

        let date = await model.save()

        XCTAssertNil(api.classes.creates.first?.level, "Geen is left out")
        XCTAssertNil(date?.level)
    }

    func test_F067_AC1_aChosenLevelIsSomethingEnteredSoLeavingAsks() {
        let model = form(SessionFixtures.api())
        XCTAssertFalse(model.isDirty)
        model.level = .intermediate
        XCTAssertTrue(model.isDirty)
        model.level = nil
        XCTAssertFalse(model.isDirty)
    }
}
