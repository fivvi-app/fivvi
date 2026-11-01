import FivviAPI
import XCTest

@testable import FivviPro

/// *+ Nieuwe klant* (F006 AC1 to AC3, AC12) and *Bewerken* (AC7): the form's rules and messages are the web's. The test
/// plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClientFormViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private func workspace(_ defaultLocale: ClientLocale = .nlNL) -> CurrentWorkspace {
        .init(id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", defaultLocale: defaultLocale)
    }

    private func johnsGym() -> StubAPI {
        let api = StubAPI()
        api.clients.seed([.init("Anna de Vries", "anna@example.com", .en), .init("Mark Jansen", nil, nil)])
        return api
    }

    private func form(
        _ api: StubAPI, mode: ClientFormViewModel.Mode = .add, defaultLocale: ClientLocale = .nlNL,
        forbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) -> ClientFormViewModel {
        ClientFormViewModel(
            api: api, workspace: workspace(defaultLocale), catalog: Catalog(locale: language), mode: mode,
            onForbidden: forbidden
        )
    }

    private func editForm(_ api: StubAPI, _ name: String, forbidden: @escaping @MainActor (
        WorkspaceCapabilities.Capability
    ) async -> Void = { _ in }) -> ClientFormViewModel {
        let client = api.clients.all.first { $0.name == name }
        return form(api, mode: .edit(client ?? .init(id: "", name: "")), forbidden: forbidden)
    }

    func test_F006_AC1_aNameAloneAddsAClientWhoseEmailsFollowTheWorkspaceDefault() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = johnsGym()
        let form = form(api)
        form.name = "  Bram Visser "

        let addedResult = await form.submit()

        let added = try XCTUnwrap(addedResult)

        XCTAssertEqual(added.name, "Bram Visser", "trimmed")
        XCTAssertNil(added.email)
        XCTAssertNil(added.emailLocale, "follows the workspace's default")
        let sent = try XCTUnwrap(api.clients.adds.first)
        XCTAssertEqual(api.clients.adds.count, 1)
        XCTAssertEqual(sent.name, "Bram Visser")
        XCTAssertNil(sent.email)
        XCTAssertNil(sent.emailLocale)
        XCTAssertEqual(sent.surface, .ios, "client_added carries the surface")
        XCTAssertEqual(api.clients.all.count, 3)
    }

    func test_F006_AC2_theEmailAddressAndTheLanguageAreStored() async throws {
        let api = johnsGym()
        let form = form(api)
        form.name = "Eva Smit"
        form.email = " Eva@Example.com "
        form.locale = .en

        let addedResult = await form.submit()

        let added = try XCTUnwrap(addedResult)

        XCTAssertEqual(added.email, "eva@example.com", "lower case")
        XCTAssertEqual(added.emailLocale, .en)
        XCTAssertEqual(api.clients.adds.first?.email, "Eva@Example.com", "the app sends what was typed, trimmed")
    }

    func test_F006_AC2_anInvalidEmailAndAnEmptyBlankOrTooLongNameAreRefusedWithAFieldMessageAndNothingIsSent() async {
        let api = johnsGym()
        let catalog = TestCatalog(language)
        let form = form(api)

        for name in ["", "   \n"] {
            form.name = name
            let added = await form.submit()
            XCTAssertNil(added)
            XCTAssertEqual(form.nameErrorText, catalog["clients.addDialog.errors.nameRequired"], "'\(name)'")
        }
        form.name = String(repeating: "a", count: 121)
        _ = await form.submit()
        XCTAssertEqual(form.nameErrorText, catalog["clients.addDialog.errors.nameTooLong"])
        form.name = String(repeating: "a", count: 120)
        form.email = "not-an-address"
        _ = await form.submit()
        XCTAssertNil(form.nameErrorText, "120 characters are fine")
        XCTAssertEqual(form.emailErrorText, catalog["clients.addDialog.errors.emailInvalid"])

        XCTAssertTrue(api.clients.adds.isEmpty, "nothing is sent")
        XCTAssertEqual(api.clients.all.count, 2, "nothing is saved")
    }

    func test_F006_AC2_aBadRequestFromTheApiGoesToTheFieldItNames() async {
        let api = johnsGym()
        let catalog = TestCatalog(language)
        let form = form(api)
        form.name = "Eva"
        api.clients.fail(.add, with: .badRequest(["email"]))
        _ = await form.submit()
        XCTAssertEqual(form.emailErrorText, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertNil(form.nameErrorText)

        api.clients.fail(.add, with: .badRequest(["name"]))
        _ = await form.submit()
        XCTAssertEqual(form.nameErrorText, catalog["clients.addDialog.errors.nameTooLong"])
        XCTAssertNil(form.emailErrorText, "the messages of the last answer only")

        api.clients.fail(.add, with: .badRequest(["surface"]))
        _ = await form.submit()
        XCTAssertEqual(form.saveFailedText, catalog["clients.addDialog.errors.notSaved"])
    }

    func test_F006_AC3_anEmailAddressOfAnExistingClientOffersThatClientAndAddsNoSecondOne() async {
        let api = johnsGym()
        let catalog = TestCatalog(language)
        let form = form(api)
        form.name = "Anna Visser"
        form.email = "ANNA@example.com"

        let added = await form.submit()

        XCTAssertNil(added)
        XCTAssertEqual(form.existing?.name, "Anna de Vries")
        XCTAssertEqual(form.existing?.id, api.clients.id(of: "Anna de Vries"))
        XCTAssertEqual(form.existsText, String(format: catalog["clients.addDialog.exists"], "Anna de Vries"))
        XCTAssertEqual(
            form.openExistingText, String(format: catalog["clients.addDialog.openExisting"], "Anna de Vries")
        )
        XCTAssertEqual(api.clients.all.count, 2, "no second client")
        XCTAssertEqual(form.email, "ANNA@example.com", "the input stays")

        form.useAnotherEmail()
        XCTAssertNil(form.existing)
        form.email = "anna.visser@example.com"
        let second = await form.submit()
        XCTAssertEqual(second?.email, "anna.visser@example.com")
    }

    func test_F006_AC3_twoClientsWithoutAnEmailAddressMayShareAName() async throws {
        let api = johnsGym()
        let form = form(api)
        form.name = "Mark Jansen"

        let addedResult = await form.submit()

        let added = try XCTUnwrap(addedResult)

        XCTAssertNotEqual(added.id, api.clients.id(of: "Mark Jansen"))
        XCTAssertEqual(api.clients.all.filter { $0.name == "Mark Jansen" }.count, 2)
        XCTAssertNil(form.existing)
    }

    func test_F006_AC12_aFailedSaveKeepsTheInputAndSaysNothingWasSaved() async {
        let api = johnsGym()
        let form = form(api)
        form.name = "Eva Smit"
        form.email = "eva@example.com"
        form.locale = .nlNL
        for failure in [StubClients.Failure.offline, .status(500)] {
            api.clients.fail(.add, with: failure)

            let added = await form.submit()

            XCTAssertNil(added)
            let notSaved = TestCatalog(language)["clients.addDialog.errors.notSaved"]
            XCTAssertEqual(form.saveFailedText, notSaved, "\(failure)")
            XCTAssertEqual(form.name, "Eva Smit")
            XCTAssertEqual(form.email, "eva@example.com")
            XCTAssertEqual(form.locale, .nlNL)
            XCTAssertFalse(form.isSaving)
        }
        api.clients.fail(.add, with: nil)
        let added = await form.submit()
        XCTAssertEqual(added?.name, "Eva Smit")
        XCTAssertNil(form.saveFailedText, "the message goes with the next try")
    }

    func test_F006_AC10_noAccessTellsTheHelperAndShowsTheNoPermissionState() async {
        let api = johnsGym()
        var forbidden: [WorkspaceCapabilities.Capability] = []
        let form = form(api, forbidden: { forbidden.append($0) })
        form.name = "Eva"
        api.clients.fail(.add, with: .forbidden)

        let added = await form.submit()

        XCTAssertNil(added)
        XCTAssertTrue(form.noPermission)
        XCTAssertEqual(forbidden, [.clients_manage], "the helper hides + Nieuwe klant")
        XCTAssertEqual(form.noPermissionText, String(format: TestCatalog(language)["noPermission.body"], "John's Gym"))
    }

    func test_F006_AC1_theLanguageChoiceNamesTheWorkspaceDefault() {
        let catalog = TestCatalog(language)
        let dutch = form(johnsGym(), defaultLocale: .nlNL)
        let english = form(johnsGym(), defaultLocale: .en)

        XCTAssertNil(dutch.locale, "Standaard is preselected")
        XCTAssertEqual(
            dutch.defaultLocaleText,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.nl"])
        )
        XCTAssertEqual(
            english.defaultLocaleText,
            String(format: catalog["clients.addDialog.localeDefault"], catalog["clients.languageNames.en"])
        )
        XCTAssertEqual(Catalog(locale: language)[.clientsLocaleNl], catalog["clients.addDialog.localeNl"])
        XCTAssertEqual(Catalog(locale: language)[.clientsLocaleEn], catalog["clients.addDialog.localeEn"])
    }

    // MARK: Edit

    func test_F006_AC7_editingSendsOnlyWhatChanged() async throws {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")
        XCTAssertEqual(form.name, "Anna de Vries")
        XCTAssertEqual(form.email, "anna@example.com")
        XCTAssertEqual(form.locale, .en)

        form.name = "Anna Visser"
        let savedResult = await form.submit()
        let saved = try XCTUnwrap(savedResult)

        XCTAssertEqual(saved.name, "Anna Visser")
        XCTAssertEqual(saved.email, "anna@example.com")
        XCTAssertEqual(saved.emailLocale, .en)
        let body = try XCTUnwrap(api.clients.updates.first?.body)
        XCTAssertEqual(body, .init(name: "Anna Visser"), "the email and the language are kept, not cleared")
    }

    func test_F006_AC7_clearingTheEmailAndResettingTheLanguageUseTheirFlags() async throws {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")
        form.email = "  "
        form.locale = nil

        let savedResult = await form.submit()

        let saved = try XCTUnwrap(savedResult)

        XCTAssertNil(saved.email)
        XCTAssertNil(saved.emailLocale)
        XCTAssertEqual(api.clients.updates.first?.body, .init(clearEmail: true, clearEmailLocale: true))
    }

    func test_F006_AC7_aNewEmailAddressAndLanguageAreSent() async throws {
        let api = johnsGym()
        let form = editForm(api, "Mark Jansen")
        form.email = "Mark@Example.com"
        form.locale = .nlNL

        let savedResult = await form.submit()

        let saved = try XCTUnwrap(savedResult)

        XCTAssertEqual(saved.email, "mark@example.com")
        XCTAssertEqual(saved.emailLocale, .nlNL)
        XCTAssertEqual(api.clients.updates.first?.body, .init(email: "Mark@Example.com", emailLocale: .nlNL))
    }

    func test_F006_AC7_nothingChangedSendsNothing() async {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")

        let saved = await form.submit()

        XCTAssertEqual(saved?.name, "Anna de Vries")
        XCTAssertTrue(api.clients.updates.isEmpty)
    }

    func test_F006_AC7_theDuplicateRuleAppliesToTheNewEmailAddress() async {
        let api = johnsGym()
        let form = editForm(api, "Mark Jansen")
        form.email = "anna@example.com"

        let saved = await form.submit()

        XCTAssertNil(saved)
        XCTAssertEqual(form.existing?.name, "Anna de Vries")
        XCTAssertNil(api.clients.all.first { $0.name == "Mark Jansen" }?.email, "nothing was saved")
    }
}
