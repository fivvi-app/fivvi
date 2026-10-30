import FivviAPI
import XCTest

@testable import FivviPro

/// *Profiel* (TM-04): the workspaces the person is on the team of, with their role, from `GET /api/v1/me/workspaces`
/// (F003 AC9). The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ProfileViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func model(_ api: StubAPI) -> ProfileViewModel {
        ProfileViewModel(api: api, catalog: Catalog(locale: language))
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
        let model = model(api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        let catalog = TestCatalog(language)
        XCTAssertEqual(model.state, .loaded([
            .init(
                id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", slug: "johns-gym",
                role: catalog["roles.trainer"]
            ),
            .init(
                id: "7c1d2e3f-0000-4000-8000-000000000002", name: "Sarah Personal Training",
                slug: "sarah-personal-training", role: catalog["roles.owner"]
            )
        ]))
        let calls = await api.myWorkspacesCalls
        XCTAssertEqual(calls, 1)
    }

    func test_F003_AC9_theTitlesComeFromTheCatalog() {
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)

        XCTAssertEqual(catalog[.profileTitle], expected["profile.title"])
        XCTAssertEqual(catalog[.myProfileWorkspacesTitle], expected["myProfile.workspacesTitle"])
        XCTAssertEqual(catalog[.profileError], expected["profile.error"])
        XCTAssertEqual(catalog[.rolesOwner], expected["roles.owner"])
        XCTAssertEqual(catalog[.rolesTrainer], expected["roles.trainer"])
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
        let model = model(api)
        await model.load()
        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.map(\.name), ["John's Gym", "Sarah Personal Training"])
    }

    func test_F003_AC9_aReloadKeepsTheListOnScreenUntilTheNewOneArrives() async {
        let api = StubAPI()
        await answerAsSarah(api)
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
        let model = model(api)
        await model.load()
        await api.answerMyWorkspaces(with: .offline)

        await model.refresh()

        guard case let .loaded(entries) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(entries.count, 2)
    }
}
