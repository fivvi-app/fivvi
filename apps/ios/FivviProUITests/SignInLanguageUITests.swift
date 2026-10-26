import XCTest

/// The language of TM-01 and of the `locale` it sends (F001 AC14, ADR-017).
@MainActor
final class SignInLanguageUITests: SignInUITestCase {
    func test_F001N_AC14_unsupportedDeviceLanguageRequestsEnglish() throws {
        let english = TestCatalog("en")
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = SignInScreen.launch(against: server, deviceLanguages: ["de-DE", "fr-FR"])

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.title.label, english["signIn.title"])
        XCTAssertEqual(screen.sendCode.label, english["signIn.sendCode"])
        screen.requestCode(for: server.signIn.email)
        XCTAssertEqual(
            screen.checkEmail.label, String(format: english["signIn.checkEmailBodyApp"], server.signIn.email)
        )
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/request").map(\.body),
            [["email": server.signIn.email, "locale": "en"]]
        )
    }

    func test_F001N_AC14_perAppLanguageWins() throws {
        for (device, perApp, expected) in [(["de-DE"], "nl", TestCatalog("nl")), (["nl-NL"], "en", TestCatalog("en"))] {
            let server = try StubServer(.greeting(key: "hello.title"))

            let screen = SignInScreen.launch(against: server, deviceLanguages: device, perAppLanguage: perApp)

            XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout), "\(perApp) on \(device)")
            XCTAssertEqual(screen.title.label, expected["signIn.title"], "\(perApp) on \(device)")
            screen.requestCode(for: server.signIn.email)
            XCTAssertEqual(
                server.requests(to: "/api/v1/sign-in/request").map(\.body),
                [["email": server.signIn.email, "locale": expected.apiLocale]],
                "\(perApp) on \(device)"
            )
            screen.app.terminate()
        }
    }
}
