import FivviAPI
import XCTest

@testable import FivviPro

/// *Bewerken* (F006 AC7): the edit sends only what changed and never clears the email address, which every client has
/// (spec #174). The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClientFormEditTests: ClientFormTestCase {
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

    func test_F006_AC7_resettingTheLanguageUsesItsFlagAndKeepsTheEmailAddress() async throws {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")
        form.locale = nil

        let savedResult = await form.submit()

        let saved = try XCTUnwrap(savedResult)

        XCTAssertEqual(saved.email, "anna@example.com")
        XCTAssertNil(saved.emailLocale)
        XCTAssertEqual(api.clients.updates.first?.body, .init(clearEmailLocale: true))
    }

    func test_F006_AC7_anEmptiedEmailAddressIsRefusedAndTheClientKeepsIt() async {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")
        for email in ["", "  "] {
            form.email = email

            let saved = await form.submit()

            XCTAssertNil(saved, "'\(email)'")
            XCTAssertEqual(form.emailErrorText, TestCatalog(language)["clients.addDialog.errors.emailInvalid"])
        }
        XCTAssertTrue(api.clients.updates.isEmpty, "nothing is sent")
        XCTAssertEqual(api.clients.all.first { $0.name == "Anna de Vries" }?.email, "anna@example.com")
    }

    func test_F006_AC7_theApisBadRequestOnTheEmailShowsItInlineAndTheClientKeepsIt() async {
        let api = johnsGym()
        let form = editForm(api, "Anna de Vries")
        form.email = "anna.de.vries@example.com"
        api.clients.fail(.update, with: .badRequest(["email"]))

        let saved = await form.submit()

        XCTAssertNil(saved)
        XCTAssertEqual(form.emailErrorText, TestCatalog(language)["clients.addDialog.errors.emailInvalid"])
        XCTAssertEqual(api.clients.all.first { $0.name == "Anna de Vries" }?.email, "anna@example.com")
    }

    func test_F006_AC7_aNewEmailAddressAndLanguageAreSent() async throws {
        let api = johnsGym()
        let form = editForm(api, "Mark Jansen")
        form.email = "Mark.Jansen@Example.com"
        form.locale = .nlNL

        let savedResult = await form.submit()

        let saved = try XCTUnwrap(savedResult)

        XCTAssertEqual(saved.email, "mark.jansen@example.com")
        XCTAssertEqual(saved.emailLocale, .nlNL)
        XCTAssertEqual(api.clients.updates.first?.body, .init(email: "Mark.Jansen@Example.com", emailLocale: .nlNL))
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
        let mark = api.clients.all.first { $0.name == "Mark Jansen" }
        XCTAssertEqual(mark?.email, "mark@example.com", "nothing was saved")
    }
}
