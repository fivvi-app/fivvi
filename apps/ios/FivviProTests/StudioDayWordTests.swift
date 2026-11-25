import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Hele studio* follows the workspace's word (F068, #1604): the account is read again, the word may have changed, and the
/// studio says the new one without starting over.
@MainActor
final class StudioDayWordTests: StudioDayTestCase {
    private func johns(saying word: Components.Schemas.TrainerWord) -> CurrentWorkspace {
        var workspace = StudioFixtures.workspace
        workspace.trainerWord = word
        return workspace
    }

    func test_F068_theStudioKeyChangesWithTheWord() {
        let was = StudioKey(workspace: johns(saying: .trainer), canManage: true)

        let changed = StudioKey(workspace: johns(saying: .instructeur), canManage: true)
        XCTAssertNotEqual(was, changed, "the task runs again")
        XCTAssertEqual(was, StudioKey(workspace: johns(saying: .trainer), canManage: true), "and only for the word")
        XCTAssertNotEqual(was, StudioKey(workspace: nil, canManage: true))
    }

    func test_F068_theStudioSaysTheNewWordWithoutReadingTheDayAgainOrLeavingHeleStudio() async {
        let api = johnWithATeam()
        let model = makeModel(api)
        await model.configure(workspace: johns(saying: .trainer), canManage: true)
        await model.select(.studio)
        XCTAssertEqual(model.line, String(format: catalog["myDay.app.studioLine"], words, "John's Gym"))
        let day = model.day

        await model.configure(workspace: johns(saying: .instructeur), canManage: true)

        let plural = catalog["trainerWord.instructeur.words"]
        XCTAssertEqual(model.line, String(format: catalog["myDay.app.studioLine"], plural, "John's Gym"))
        XCTAssertTrue(model.isStudio, "the control stays on Hele studio")
        XCTAssertEqual(model.state, .loaded, "no loading state flashes")
        XCTAssertEqual(model.day, day, "the day on screen stays")
        XCTAssertEqual(api.workspaceDay.requests.count, 1, "the day is not read again for a word")
    }
}
