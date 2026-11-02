import FivviAPI
import XCTest

@testable import FivviPro

/// *Profiel* (TM-04), the name (F005 AC1): read from `GET /api/v1/me`, changed in a sheet with `PATCH /api/v1/me`. The API
/// words the refusal; the app checks nothing. The test plan runs every test in nl and en.
@MainActor
final class ProfileNameTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    func test_F005_AC1_profileShowsTheNameAndTheEmailAddress() async {
        let api = StubAPI()

        let model = await ProfileFixtures.loadedModel(api)

        XCTAssertEqual(model.account, .init(name: "Sarah", email: "sarah@example.com"))
        XCTAssertFalse(model.nameSaved)
        XCTAssertNil(model.editor)
    }

    func test_F005_AC1_editNameUpdatesProfile() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)

        model.startEditingName()
        XCTAssertEqual(model.editor, .init(input: "Sarah"))
        model.enterName("Sarah Maestro")
        await model.saveName()

        let saved = await api.savedNames
        XCTAssertEqual(saved, ["Sarah Maestro"])
        XCTAssertEqual(model.account?.name, "Sarah Maestro")
        XCTAssertEqual(model.account?.email, "sarah@example.com")
        XCTAssertTrue(model.nameSaved)
        XCTAssertNil(model.editor, "the sheet closes once the API accepted")
    }

    func test_F005_AC1_editingAgainClearsTheConfirmation() async {
        let model = await ProfileFixtures.loadedModel(StubAPI())
        model.startEditingName()
        await model.saveName()
        XCTAssertTrue(model.nameSaved)

        model.startEditingName()

        XCTAssertFalse(model.nameSaved)
    }

    func test_F005_AC1_withoutANameTheSheetStartsEmpty() async {
        let model = await ProfileFixtures.loadedModel(StubAPI(), name: nil)

        XCTAssertNil(model.account?.name)
        model.startEditingName()

        XCTAssertEqual(model.editor?.input, "")
    }

    func test_F005_AC1_cancelClosesTheSheetAndChangesNothing() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        model.startEditingName()
        model.enterName("Someone else")

        model.cancelEditingName()

        XCTAssertNil(model.editor)
        XCTAssertEqual(model.account?.name, "Sarah")
        let saved = await api.savedNames
        XCTAssertEqual(saved, [])
    }

    func test_F005_AC1_theAppChecksNothingItselfAndSendsWhatWasTyped() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        model.startEditingName()
        model.enterName("   ")

        await model.saveName()

        let saved = await api.savedNames
        XCTAssertEqual(saved, ["   "], "the API trims and refuses; the app has no rule of its own")
    }

    func test_F005_AC1_aRefusedNameShowsTheFieldMessageAndKeepsTheInput() async {
        let catalog = TestCatalog(language)
        let cases: [(code: String, key: String)] = [
            ("too_small", "myProfile.errors.nameRequired"), ("too_big", "myProfile.errors.nameTooLong")
        ]
        for (code, key) in cases {
            let api = StubAPI()
            let model = await ProfileFixtures.loadedModel(api)
            await api.answerUpdateMe(with: .refused(path: "name", code: code))
            model.startEditingName()
            model.enterName("typed")

            await model.saveName()

            XCTAssertEqual(model.editor?.input, "typed", code)
            XCTAssertEqual(model.editor?.saving, false, code)
            XCTAssertEqual(model.nameMessage, catalog[key], code)
            XCTAssertEqual(model.account?.name, "Sarah", code)
            XCTAssertFalse(model.nameSaved, code)
        }
    }

    func test_F005_AC1_otherFailuresKeepTheInputAndSayWhy() async {
        let catalog = TestCatalog(language)
        let answers: [(StubAPI.UpdateMeAnswer, String)] = [
            (.offline, "myProfile.errors.noConnection"),
            (.status(500), "myProfile.errors.generic"),
            (.refused(path: "surface", code: "invalid_value"), "myProfile.errors.generic"),
            (.refused(path: "name", code: "invalid_type"), "myProfile.errors.generic")
        ]
        for (answer, key) in answers {
            let api = StubAPI()
            let model = await ProfileFixtures.loadedModel(api)
            await api.answerUpdateMe(with: answer)
            model.startEditingName()
            model.enterName("typed")

            await model.saveName()

            XCTAssertEqual(model.editor?.input, "typed", "\(answer)")
            XCTAssertEqual(model.nameMessage, catalog[key], "\(answer)")
            XCTAssertEqual(model.account?.name, "Sarah", "\(answer)")
        }
    }

    func test_F005_AC1_typingClearsTheMessageAndSavingAgainWorks() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        await api.answerUpdateMe(with: .offline)
        model.startEditingName()
        model.enterName("Sarah B")
        await model.saveName()
        XCTAssertNotNil(model.nameMessage)

        model.enterName("Sarah Bakker")
        XCTAssertNil(model.nameMessage)
        await api.answerUpdateMe(with: .accepted)
        await model.saveName()

        XCTAssertEqual(model.account?.name, "Sarah Bakker")
        XCTAssertNil(model.editor)
    }

    func test_F005_AC1_aSecondSaveWhileOneIsUnderWayIsIgnored() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        await api.answerUpdateMe(with: .hang)
        model.startEditingName()
        model.enterName("Sarah Bakker")
        let first = Task { await model.saveName() }
        await api.untilUpdateMeHangs()
        XCTAssertTrue(model.isSaving, "back does nothing meanwhile")
        XCTAssertEqual(model.editor?.saving, true)

        await model.saveName()
        model.enterName("changed while saving")
        model.cancelEditingName()
        await api.releaseHangingUpdateMes()
        await first.value

        let saved = await api.savedNames
        XCTAssertEqual(saved, ["Sarah Bakker"])
        XCTAssertFalse(model.isSaving)
        XCTAssertNil(model.editor)
        XCTAssertEqual(model.account?.name, "Sarah Bakker")
    }

    func test_F005_AC1_aForegroundReadLeavesTheSheetAndWhatIsTypedAlone() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        model.startEditingName()
        model.enterName("half typed")

        await model.refresh()

        XCTAssertEqual(model.editor, .init(input: "half typed"))
    }

    func test_F005_AC1_aReadThatStartedBeforeTheSaveDoesNotPutTheOldNameBack() async {
        let api = StubAPI()
        let model = await ProfileFixtures.loadedModel(api)
        await api.answerMe(with: .hang)
        let read = Task { await model.refresh() }
        await api.untilMeHangs()

        model.startEditingName()
        model.enterName("Sarah Bakker")
        await model.saveName()
        await api.releaseHangingMes()
        await read.value

        XCTAssertEqual(model.account?.name, "Sarah Bakker", "the answer to the older read is older than the save")
    }

    func test_F005_theTextsComeFromTheCatalog() {
        let catalog = Catalog(locale: language)
        let expected = TestCatalog(language)

        XCTAssertEqual(catalog[.commonCancel], expected["common.cancel"])
        XCTAssertEqual(catalog[.myProfileDetailsTitle], expected["myProfile.detailsTitle"])
        XCTAssertEqual(catalog[.myProfileNameLabel], expected["myProfile.nameLabel"])
        XCTAssertEqual(catalog[.myProfileEmailLabel], expected["myProfile.emailLabel"])
        XCTAssertEqual(catalog[.myProfileEditName], expected["myProfile.editName"])
        XCTAssertEqual(catalog[.myProfileSave], expected["myProfile.save"])
        XCTAssertEqual(catalog[.myProfileSaved], expected["myProfile.saved"])
        XCTAssertEqual(catalog[.myProfileErrorsNameRequired], expected["myProfile.errors.nameRequired"])
        XCTAssertEqual(catalog[.myProfileErrorsNameTooLong], expected["myProfile.errors.nameTooLong"])
        XCTAssertEqual(catalog[.myProfileErrorsNoConnection], expected["myProfile.errors.noConnection"])
        XCTAssertEqual(catalog[.myProfileErrorsGeneric], expected["myProfile.errors.generic"])
        XCTAssertEqual(catalog[.profileTrainsHereSaved], expected["profile.trainsHere.saved"])
        XCTAssertEqual(
            catalog[.profileTrainsHereErrorsNoConnection], expected["profile.trainsHere.errors.noConnection"]
        )
        XCTAssertEqual(catalog[.profileTrainsHereErrorsGeneric], expected["profile.trainsHere.errors.generic"])
        XCTAssertTrue(
            catalog.string(.profileTrainsHereLabel, "John's Gym").contains("John's Gym"),
            "the label names the workspace"
        )
    }
}
