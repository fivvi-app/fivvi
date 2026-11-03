import FivviAPI
import XCTest

@testable import FivviPro

/// *+ Nieuwe klant* (F006 AC1 to AC3, AC12) and *Bewerken* (AC7): the form's rules and messages are the web's. The test
/// plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClientFormViewModelTests: ClientFormTestCase {
    func test_F006_AC1_aNameAndAnEmailAddressAddAClientWhoseEmailsFollowTheWorkspaceDefault() async throws {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = johnsGym()
        let form = form(api)
        form.name = "  Bram Visser "
        form.email = " bram@example.com "

        let addedResult = await form.submit()

        let added = try XCTUnwrap(addedResult)

        XCTAssertEqual(added.name, "Bram Visser", "trimmed")
        XCTAssertEqual(added.email, "bram@example.com")
        XCTAssertNil(added.emailLocale, "follows the workspace's default")
        let sent = try XCTUnwrap(api.clients.adds.first)
        XCTAssertEqual(api.clients.adds.count, 1)
        XCTAssertEqual(sent.name, "Bram Visser")
        XCTAssertEqual(sent.email, "bram@example.com", "always sent, trimmed")
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

    func test_F006_AC2_aMissingOrInvalidEmailAndABlankOrTooLongNameAreRefusedWithAFieldMessageAndNothingIsSent() async {
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
        for email in ["", "  \n"] {
            form.email = email
            let added = await form.submit()
            XCTAssertNil(added)
            XCTAssertNil(form.nameErrorText, "120 characters are fine")
            XCTAssertEqual(form.emailErrorText, catalog["clients.addDialog.errors.emailInvalid"], "'\(email)'")
        }
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
        form.email = "eva@example.com"
        api.clients.fail(.add, with: .badRequest(["email"]))
        let added = await form.submit()
        XCTAssertNil(added)
        XCTAssertEqual(form.emailErrorText, catalog["clients.addDialog.errors.emailInvalid"])
        XCTAssertNil(form.nameErrorText)
        XCTAssertNil(form.saveFailedText)
        XCTAssertEqual(api.clients.all.count, 2, "nothing was added")

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

    func test_F006_AC3_twoClientsWithDifferentEmailAddressesMayShareAName() async throws {
        let api = johnsGym()
        let form = form(api)
        form.name = "Mark Jansen"
        form.email = "mark.jansen@example.com"

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
        form.email = "eva@example.com"
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
}
