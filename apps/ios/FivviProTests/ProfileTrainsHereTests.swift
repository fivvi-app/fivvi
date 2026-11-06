import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Profiel* (TM-04), the Owner's switch *I also train here* (F005 AC4, AC5): shown where `GET /api/v1/me/workspaces`
/// lists `team.manage`, never from the role; it moves only when the API accepted the change (`PUT` / `DELETE` of the
/// trainer profile). The test plan runs every test in nl and en.
@MainActor
final class ProfileTrainsHereTests: XCTestCase {
    private let johns = ProfileFixtures.johns
    private let own = ProfileFixtures.own

    private func entry(_ model: ProfileViewModel, _ id: String) -> ProfileViewModel.Entry? {
        guard case let .loaded(entries) = model.state else { return nil }
        return entries.first { $0.id == id }
    }

    // MARK: AC5: no switch for a Trainer

    func test_F005_AC5_noSwitchWhereThePersonIsTrainer() async {
        let api = StubAPI()

        let model = await ProfileFixtures.loadedModel(api)

        XCTAssertEqual(entry(model, johns)?.canSwitchTrainsHere, false)
        XCTAssertEqual(entry(model, own)?.canSwitchTrainsHere, true)
        await model.setTrainsHere(false, in: johns)
        let calls = await api.trainerCalls
        XCTAssertEqual(calls, [], "nothing is sent for a switch that is not there")
    }

    func test_F005_AC5_theCapabilityDecidesNotTheRoleName() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "sarah@example.com"))
        await api.answerMyWorkspaces(with: .workspaces([
            // A Trainer whose list has team.manage gets the switch; an Owner whose list has not, gets none.
            .init(
                workspaceID: johns, name: "John's Gym", slug: "johns-gym", role: .trainer,
                capabilities: [.clients_view, .team_manage]
            ),
            .init(
                workspaceID: own, name: "Sarah Personal Training", slug: "sarah-personal-training", role: .owner,
                capabilities: [.clients_view]
            )
        ]))
        let model = ProfileViewModel(api: api, catalog: Catalog(locale: InterfaceLanguage.resolve(.system())))

        await model.load()

        XCTAssertEqual(entry(model, johns)?.canSwitchTrainsHere, true)
        XCTAssertEqual(entry(model, own)?.canSwitchTrainsHere, false)
    }

    // MARK: AC4: an Owner switches training off and on

    func test_F005_AC4_switchingOffDeletesTheTrainerProfile() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        XCTAssertEqual(entry(model, own)?.trainsHere, true)

        await model.setTrainsHere(false, in: own)

        let calls = await api.trainerCalls
        XCTAssertEqual(calls, [.init(workspaceID: own, trains: false)])
        XCTAssertEqual(entry(model, own)?.trainsHere, false)
        XCTAssertEqual(entry(model, own)?.change, .saved)
    }

    func test_F005_AC4_switchingOnPutsTheTrainerProfile() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: false)

        await model.setTrainsHere(true, in: own)

        let calls = await api.trainerCalls
        XCTAssertEqual(calls, [.init(workspaceID: own, trains: true)])
        XCTAssertEqual(entry(model, own)?.trainsHere, true)
        XCTAssertEqual(entry(model, own)?.change, .saved)
    }

    func test_F005_AC4_theSwitchMovesOnlyWhenTheApiAccepted() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        await api.answerTrainerProfile(with: .hang)

        let saving = Task { await model.setTrainsHere(false, in: own) }
        await api.untilTrainerCallHangs()

        XCTAssertEqual(entry(model, own)?.trainsHere, true, "still as it was while the API has not answered")
        XCTAssertEqual(entry(model, own)?.change, .saving)
        XCTAssertTrue(model.isSaving, "back does nothing meanwhile")
        await model.setTrainsHere(false, in: own)
        let whileSaving = await api.trainerCalls
        XCTAssertEqual(whileSaving.count, 1, "a second tap meanwhile sends nothing")

        await api.releaseHangingTrainerCalls()
        await saving.value

        XCTAssertEqual(entry(model, own)?.trainsHere, false)
        XCTAssertFalse(model.isSaving)
    }

    func test_F005_AC4_aFailedSaveLeavesTheSwitchAndSaysWhy() async {
        let answers: [(ProfileScript.Answer, ProfileViewModel.TrainsHereChange)] = [
            (.offline, .noConnection), (.status(500), .failed)
        ]
        for (answer, change) in answers {
            let api = StubAPI()
            let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
            await api.answerTrainerProfile(with: answer)

            await model.setTrainsHere(false, in: own)

            XCTAssertEqual(entry(model, own)?.trainsHere, true, "\(answer)")
            XCTAssertEqual(entry(model, own)?.change, change, "\(answer)")
            let reads = await api.myWorkspacesCalls
            XCTAssertEqual(reads, 1, "\(answer): no reason to read again")
        }
    }

    func test_F005_AC4_theSavedAndErrorLinesAreAnnounced() async {
        let catalog = TestCatalog(InterfaceLanguage.resolve(.system()))
        let answers: [(ProfileScript.Answer, String)] = [
            (.accepted, "profile.trainsHere.saved"), (.offline, "profile.trainsHere.errors.noConnection"),
            (.status(500), "profile.trainsHere.errors.generic")
        ]
        for (answer, key) in answers {
            let announcements = Announcements()
            let api = StubAPI()
            let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true, announcements: announcements)
            await api.answerTrainerProfile(with: answer)

            await model.setTrainsHere(false, in: own)

            XCTAssertEqual(announcements.texts, [catalog[key]], "\(answer)")
        }
    }

    func test_F005_AC4_aRefusalReadsTheListAgain() async {
        for answer in [ProfileScript.Answer.forbidden, .notFound] {
            let api = StubAPI()
            let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
            await api.answerTrainerProfile(with: answer)
            // The person lost the right meanwhile: the list no longer has the switch.
            await api.answerMyWorkspaces(with: .workspaces([
                .init(
                    workspaceID: own, name: "Sarah Personal Training", slug: "sarah-personal-training",
                    role: .trainer, trainsHere: true
                )
            ]))

            await model.setTrainsHere(false, in: own)

            let reads = await api.myWorkspacesCalls
            XCTAssertEqual(reads, 2, "\(answer)")
            XCTAssertEqual(entry(model, own)?.canSwitchTrainsHere, false, "\(answer)")
            XCTAssertEqual(entry(model, own)?.trainsHere, true, "\(answer)")
            XCTAssertEqual(entry(model, own)?.change, .failed, "\(answer)")
        }
    }

    func test_F005_AC4_aSavingRowSurvivesAForegroundRead() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        await api.answerTrainerProfile(with: .hang)
        let saving = Task { await model.setTrainsHere(false, in: own) }
        await api.untilTrainerCallHangs()

        await model.refresh()

        XCTAssertEqual(entry(model, own)?.change, .saving)
        XCTAssertEqual(entry(model, own)?.trainsHere, true)
        await api.releaseHangingTrainerCalls()
        await saving.value
        XCTAssertEqual(entry(model, own)?.change, .saved)
        XCTAssertEqual(entry(model, own)?.trainsHere, false)
    }

    func test_F005_AC4_aReadThatStartedBeforeTheAcceptedChangeDoesNotPutTheOldStateBack() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        await api.answerMe(with: .hang)
        let read = Task { await model.refresh() }
        await api.untilMeHangs()

        await model.setTrainsHere(false, in: own)
        await api.releaseHangingMes()
        await read.value

        XCTAssertEqual(entry(model, own)?.trainsHere, false, "the older answer still says the Owner trains")
        await api.answerMe(with: .account(email: "sarah@example.com"))
        await api.answerMyWorkspaces(with: .workspaces(ProfileFixtures.sarah(ownerTrainsHere: false)))
        await model.refresh()
        XCTAssertEqual(entry(model, own)?.trainsHere, false, "a later read is the API's own word")
    }

    func test_F005_AC4_openingProfielAgainStartsWithoutTheOldConfirmation() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        await model.setTrainsHere(false, in: own)
        XCTAssertEqual(entry(model, own)?.change, .saved)

        await model.load()

        XCTAssertEqual(entry(model, own)?.change, .idle)
    }

    func test_F005_AC4_theRoleLabelsFollowTheLanguageAndKeepTheSwitchState() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api, ownerTrainsHere: true)
        await model.setTrainsHere(false, in: own)

        let other: Components.Schemas.Locale = model.catalog.locale == .nlNL ? .en : .nlNL
        model.use(Catalog(locale: other))

        XCTAssertEqual(entry(model, own)?.trainsHere, false)
        XCTAssertEqual(entry(model, own)?.role, TestCatalog(other)["roles.owner"])
    }
}
