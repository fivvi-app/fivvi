import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Profiel* (TM-04): the workspaces the person is on the team of, with their role, from `GET /api/v1/me/workspaces`
/// (F003 AC9). The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ProfileViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func model(_ api: StubAPI) -> ProfileViewModel {
        ProfileViewModel(api: api, catalog: Catalog(locale: language))
    }

    private func answerMe(_ api: StubAPI) async {
        await api.answerMe(with: .account(email: "sarah@example.com", name: "Sarah"))
    }

    /// Sarah (synthetic): Trainer of John's Gym, Owner of Sarah Personal Training.
    private func answerAsSarah(_ api: StubAPI) async {
        await api.answerMyWorkspaces(with: .workspaces([
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", slug: "johns-gym",
                role: .trainer
            ),
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000002", name: "Sarah Personal Training",
                slug: "sarah-personal-training",
                role: .owner
            )
        ]))
    }

    func test_F003_AC9_profileListsWorkspacesWithRole() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = StubAPI()
        await answerAsSarah(api)
        await answerMe(api)
        let model = model(api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        let catalog = TestCatalog(language)
        XCTAssertEqual(model.state, .loaded([
            .init(
                id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", slug: "johns-gym",
                role: catalog["trainerWord.trainer.wordCap"], trainsHere: true, canSwitchTrainsHere: false,
                change: .idle
            ),
            .init(
                id: "7c1d2e3f-0000-4000-8000-000000000002", name: "Sarah Personal Training",
                slug: "sarah-personal-training", role: catalog["roles.owner"], trainsHere: false,
                canSwitchTrainsHere: true, change: .idle
            )
        ]))
        let calls = await api.myWorkspacesCalls
        XCTAssertEqual(calls, 1)
    }

    /// F068 AC1: John's Gym uses *instructeur*, so Sarah's role there reads *Instructeur*, and *Instructor* to a reader
    /// in English; the Owner label is the Owner's.
    func test_F068_AC1_theTrainerRoleSaysTheWorkspacesWord() async {
        let api = StubAPI()
        await api.answerMyWorkspaces(with: .workspaces([
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", slug: "johns-gym",
                role: .trainer, trainerWord: .instructeur
            ),
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000002", name: "Sarah Personal Training",
                slug: "sarah-personal-training", role: .owner, trainerWord: .coach
            )
        ]))
        await answerMe(api)
        let model = model(api)

        await model.load()

        let catalog = TestCatalog(language)
        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.map(\.role), [catalog["trainerWord.instructeur.wordCap"], catalog["roles.owner"]])
        XCTAssertEqual(entries.first?.role, language == .nlNL ? "Instructeur" : "Instructor")
    }

    /// F068 AC4: Sarah is a trainer in John's Gym (*instructeur*) and in Yoga Loft (*docent*); each row has its own word,
    /// and the role is Trainer in both (the API's value, which the app never shows or changes). The interface language
    /// changing relabels each in the new language.
    func test_F068_AC4_eachWorkspaceShowsItsOwnWord() async {
        let api = StubAPI()
        await api.answerMyWorkspaces(with: .workspaces([
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", slug: "johns-gym",
                role: .trainer, trainerWord: .instructeur
            ),
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000003", name: "Yoga Loft", slug: "yoga-loft",
                role: .trainer, trainerWord: .docent
            )
        ]))
        await answerMe(api)
        let model = model(api)

        await model.load()

        let catalog = TestCatalog(language)
        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.map(\.role), [
            catalog["trainerWord.instructeur.wordCap"], catalog["trainerWord.docent.wordCap"]
        ])
        let other: Components.Schemas.Locale = language == .nlNL ? .en : .nlNL
        model.use(Catalog(locale: other))
        guard case let .loaded(relabelled) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(relabelled.map(\.role), [
            TestCatalog(other)["trainerWord.instructeur.wordCap"], TestCatalog(other)["trainerWord.docent.wordCap"]
        ])
    }

    func test_F003_AC9_theTitlesComeFromTheCatalog() {
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)

        XCTAssertEqual(catalog[.profileTitle], expected["profile.title"])
        XCTAssertEqual(catalog[.myProfileWorkspacesTitle], expected["myProfile.workspacesTitle"])
        XCTAssertEqual(catalog[.profileError], expected["profile.error"])
        XCTAssertEqual(catalog[.rolesOwner], expected["roles.owner"])
    }

    func test_F003_AC9_aFailureShowsTheErrorAndLoadingAgainRecovers() async {
        let api = StubAPI()
        for answer in [StubAPI.MyWorkspacesAnswer.offline, .status(503), .unauthorized] {
            await api.answerMyWorkspaces(with: answer)
            let model = model(api)

            await model.load()

            XCTAssertEqual(model.state, .failed, "\(answer)")
        }
        await answerAsSarah(api)
        await answerMe(api)
        let model = model(api)
        await model.load()
        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.map(\.name), ["John's Gym", "Sarah Personal Training"])
    }

    func test_F005_aFailedAccountReadShowsTheErrorEvenWhenTheWorkspacesCame() async {
        let api = StubAPI()
        await answerAsSarah(api)
        for answer in [StubAPI.MeAnswer.offline, .status(503), .unauthorized] {
            await api.answerMe(with: answer)
            let model = model(api)

            await model.load()

            XCTAssertEqual(model.state, .failed, "\(answer)")
            XCTAssertNil(model.account)
        }
    }

    func test_F003_AC9_aReloadKeepsTheListOnScreenUntilTheNewOneArrives() async {
        let api = StubAPI()
        await answerAsSarah(api)
        await answerMe(api)
        let model = model(api)
        await model.load()
        await api.answerMyWorkspaces(with: .workspaces([
            .init(
                workspaceID: "7c1d2e3f-0000-4000-8000-000000000002", name: "Sarah Personal Training",
                slug: "sarah-personal-training",
                role: .owner
            )
        ]))

        await model.refresh()

        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.map(\.name), ["Sarah Personal Training"])
    }

    func test_F003_AC9_aFailedReloadKeepsWhatWasShown() async {
        let api = StubAPI()
        await answerAsSarah(api)
        await answerMe(api)
        let model = model(api)
        await model.load()
        await api.answerMyWorkspaces(with: .offline)

        await model.refresh()

        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.count, 2)
    }
}
