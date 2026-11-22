import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// What the tests of the Owner's *Hele studio* share (F014 AC11): the language, John's Gym and the stubbed API.
@MainActor
class StudioDayTestCase: XCTestCase {
    let language = InterfaceLanguage.resolve(.system())
    var catalog: TestCatalog { TestCatalog(language) }
    let johns = StudioFixtures.workspace

    func makeModel(
        _ api: StubAPI, now: Date = PersonalFixtures.now, onForbidden: @escaping @MainActor () async -> Void = {}
    ) -> StudioDayModel {
        StudioDayModel(api: api, catalog: Catalog(locale: language), now: { now }, onForbidden: onForbidden)
    }

    var word: String { catalog["trainerWord.trainer.word"] }
    var words: String { catalog["trainerWord.trainer.words"] }

    /// John's Gym as `GET …/trainers` lists it: the trainers given.
    func stubbed(
        trainers: [Components.Schemas.Trainer], day: Components.Schemas.WorkspaceDay? = StudioFixtures.johnsDay()
    ) -> StubAPI {
        let api = StubAPI()
        api.sessions.setTrainers(trainers, members: [])
        api.workspaceDay.serve(day)
        return api
    }

    func johnWithATeam(day: Components.Schemas.WorkspaceDay? = StudioFixtures.johnsDay()) -> StubAPI {
        stubbed(trainers: [StudioFixtures.john, StudioFixtures.sarah, StudioFixtures.tom], day: day)
    }

    func studio(_ api: StubAPI, now: Date = PersonalFixtures.now) async -> StudioDayModel {
        let model = makeModel(api, now: now)
        await model.configure(workspace: johns, canManage: true)
        await model.select(.studio)
        return model
    }

    /// *Trainer: Sarah*, as the next card words it.
    func trainerLine(_ name: String) -> String {
        String(format: catalog["myDay.app.studioTrainer"], catalog["trainerWord.trainer.wordCap"], name)
    }

    func firstName(_ name: String) -> String { String(name.split(separator: " ")[0]) }
}
