import XCTest

/// F006 AC2 in the v2 look (E020 AC14): a refused field turns red and its message is read after the field's label.
extension ClientsUITests {
    func test_F006_AC2_aMissingNameAndAMissingOrInvalidEmailAddressAreRefusedWithAFieldMessage() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        openClients(screen)
        app.buttons["clients.add"].tap()
        XCTAssertTrue(app.buttons["clients.add.submit"].waitUntilExists(timeout: timeout))

        // The field shows the message under it (E020 AC14); VoiceOver reads it once, after the field's label.
        let nameField = app.textFields["clients.add.name"]
        let emailField = app.textFields["clients.add.email"]
        let nameLabel = catalog["clients.addDialog.nameLabel"]
        let emailLabel = catalog["clients.addDialog.emailLabel"]
        let emailInvalid = "\(emailLabel), \(catalog["clients.addDialog.errors.emailInvalid"])"

        app.buttons["clients.add.submit"].tap()
        let nameRequired = "\(nameLabel), \(catalog["clients.addDialog.errors.nameRequired"])"
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { nameField.label == nameRequired })

        screen.type("Eva Smit", into: nameField)
        app.buttons["clients.add.submit"].tap()
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { emailField.label == emailInvalid },
            "a name alone is not enough"
        )
        XCTAssertEqual(nameField.label, nameLabel, "the name's message is gone")

        screen.type("not-an-address", into: emailField)
        app.buttons["clients.add.submit"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { emailField.label == emailInvalid })
        XCTAssertEqual(nameField.label, nameLabel)
        XCTAssertTrue(server.requests.filter { $0.method == "POST" }.isEmpty, "nothing is sent")
    }
}
