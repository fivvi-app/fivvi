import FivviAPI
import FivviUI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 *Groepsles*, the level in the eyebrow (F067 AC1, AC7, AC8, iOS): "Groepsles · Gevorderd" with the icon for every
/// level but *Geen*, the same for the Owner and the Trainer. The test plan runs every test in nl and en.
@MainActor
final class ClassDateLevelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }

    private func screen(
        _ api: StubAPI, level: Components.Schemas.ClassLevel?, memberID: String = StubSessions.myMemberID,
        canManage: Bool = true
    ) async -> ClassDateViewModel {
        let groupClass = api.classes.seed(nameNl: "Reformer Power", capacity: 8, level: level)
        let date = api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-10-06", "18:00"), minutes: 60, capacity: 8, trainer: nil,
            level: level
        )
        let model = ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: date.id,
            catalog: Catalog(locale: language), canManage: canManage
        )
        await model.load()
        return model
    }

    private func word(_ level: Components.Schemas.ClassLevel) -> String {
        catalog["classLevel.\(level == .allLevels ? "allLevels" : level.rawValue)"]
    }

    func test_F067_AC1_theEyebrowNamesTheTypeAndTheLevelWithTheIconForGevorderd() async {
        let model = await screen(SessionFixtures.api(), level: .advanced)
        XCTAssertEqual(model.level, .advanced)
        let type = catalog["workspaceNav.newGroupClass"]
        XCTAssertEqual(
            model.eyebrowText, String(format: catalog["classes.date.typeAndLevel"], word(.advanced), type)
        )
        XCTAssertTrue(model.eyebrowText.hasSuffix(word(.advanced)), model.eyebrowText)
        // The icon the eyebrow draws: the bars only (the word is beside them), named *Niveau: Gevorderd*.
        let icon = model.levelIcon
        XCTAssertEqual(icon?.level, .advanced)
        XCTAssertEqual(icon?.form, .bars)
        XCTAssertEqual(icon?.identifier, "classDate.level")
        XCTAssertEqual(
            icon.map { $0.catalog.levelAccessibleName($0.level) },
            String(format: catalog["classLevel.accessibleName"], word(.advanced))
        )
    }

    func test_F067_AC7_everyLevelButGeenShowsInTheEyebrowWithTheIcon() async {
        for level in Components.Schemas.ClassLevel.allCases {
            let model = await screen(SessionFixtures.api(), level: level)
            XCTAssertTrue(model.eyebrowText.hasSuffix(word(level)), "\(level): \(model.eyebrowText)")
            XCTAssertEqual(model.levelIcon?.level, level, "\(level) shows the bars, Alle niveaus too")
        }
    }

    func test_F067_AC7_withGeenTheEyebrowIsJustTheTypeWithNoSeparatorAndNoIcon() async {
        let model = await screen(SessionFixtures.api(), level: nil)
        XCTAssertNil(model.level)
        XCTAssertEqual(model.eyebrowText, catalog["workspaceNav.newGroupClass"])
        XCTAssertFalse(model.eyebrowText.contains("·"), "no stray separator")
        XCTAssertNil(model.levelIcon, "Geen draws no icon")
    }

    func test_F067_AC8_sarahTheTrainerSeesTheSameLevelAndHasNoControlToChangeIt() async {
        let api = SessionFixtures.api()
        let owner = await screen(api, level: .advanced)
        let trainer = await screen(api, level: .advanced, memberID: StubSessions.otherMemberID, canManage: false)
        XCTAssertEqual(trainer.eyebrowText, owner.eyebrowText)
        XCTAssertEqual(trainer.levelIcon?.level, .advanced)
        XCTAssertFalse(trainer.hasMenu, "no ⋯ menu, so no edit of the level")
        XCTAssertNil(trainer.ownerNoteText)
    }
}
