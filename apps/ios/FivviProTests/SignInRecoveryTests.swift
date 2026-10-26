import FivviAPI
import XCTest

@testable import FivviPro

/// TM-01's code step when something goes wrong or the person changes their mind: a new email, another address, a lost
/// connection, and what a screen reader is told.
@MainActor
final class SignInRecoveryTests: SignInModelTestCase {
    func test_F001N_AC6_resendRequestsNewEmail() async {
        let api = StubAPI()
        let announcements = Announcements()
        let model = await modelOnCodeStep(api, announcements: announcements)
        model.enterCode("12345")

        await model.resendCode()

        let requests = await api.signInRequests
        XCTAssertEqual(
            requests.map(\.email), ["owner@example.com", "owner@example.com"], "a second request, same address"
        )
        XCTAssertEqual(requests.map(\.locale.value1), [language, language])
        XCTAssertEqual(model.state, .enteringCode, "the code field is ready for the new code")
        XCTAssertEqual(model.code, "", "the old digits are cleared")
        XCTAssertNil(model.failure)
        let expected = String(format: TestCatalog(language)["signIn.resent"], "owner@example.com")
        XCTAssertEqual(model.resentText, expected)
        XCTAssertTrue(announcements.texts.contains(expected), "a screen reader is told a new email is on its way")
    }

    func test_F001N_AC6_resendNoticeGoesWithTheNextAttempt() async {
        let api = StubAPI()
        await api.answerExchange(with: .unauthorized)
        let model = await modelOnCodeStep(api)
        await model.resendCode()
        XCTAssertNotNil(model.resentText)

        model.enterCode("000000")
        await model.submitCode()

        XCTAssertNil(model.resentText)
        XCTAssertEqual(model.failure, .wrongCode)
    }

    func test_F001N_AC6_resendFailureShowsTheMessageAndStaysOnTheCodeStep() async {
        let api = StubAPI()
        let model = await modelOnCodeStep(api)
        await api.answerSignIn(with: .offline)

        await model.resendCode()

        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertEqual(model.failure, .noConnection)
        XCTAssertNil(model.resentText)
        XCTAssertTrue(model.canRetry)

        await api.answerSignIn(with: .accepted)
        await model.retry()

        XCTAssertNil(model.failure)
        XCTAssertNotNil(model.resentText, "the retry sent the email")
        let requests = await api.signInRequests
        XCTAssertEqual(requests.count, 3)
    }

    func test_F001N_AC1_changeAddressKeepsTheAddress() async {
        let api = StubAPI()
        let model = await modelOnCodeStep(api)
        model.enterCode("123")

        model.changeEmail()

        XCTAssertEqual(model.state, .enteringEmail)
        XCTAssertEqual(model.email, "owner@example.com", "the address is kept for editing")
        XCTAssertEqual(model.code, "")
        XCTAssertNil(model.failure)
        XCTAssertNil(model.resentText)

        model.email = "trainer@example.com"
        await model.requestCode()

        let requests = await api.signInRequests
        XCTAssertEqual(requests.map(\.email), ["owner@example.com", "trainer@example.com"])
        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertEqual(
            model.checkEmailText,
            String(format: TestCatalog(language)["signIn.checkEmailBodyApp"], "trainer@example.com")
        )
    }

    func test_F001N_AC1_lostConnectionOffersRetryOnTheEmailStep() async {
        let api = StubAPI()
        await api.answerSignIn(with: .offline)
        let model = model(api)
        model.email = "owner@example.com"
        XCTAssertFalse(model.canRetry)

        await model.requestCode()

        XCTAssertEqual(model.state, .enteringEmail)
        XCTAssertEqual(model.failure, .noConnection)
        XCTAssertEqual(model.failureText, TestCatalog(language)["signIn.errors.noConnection"])
        XCTAssertTrue(model.canRetry)

        await api.answerSignIn(with: .accepted)
        await model.retry()

        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertNil(model.failure)
        XCTAssertFalse(model.canRetry)
    }

    func test_F001N_AC1_lostConnectionOffersRetryOnTheCodeStep() async {
        let api = StubAPI()
        await api.answerExchange(with: .offline)
        let store = InMemorySessionStore()
        let signedIn = SignedIn()
        let model = model(api, store: store, signedIn: signedIn)
        model.email = "owner@example.com"
        await model.requestCode()
        model.enterCode("123456")

        await model.submitCode()

        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertEqual(model.failure, .noConnection)
        XCTAssertEqual(model.code, "123456", "the digits stay: it was the connection, not the code")
        XCTAssertTrue(model.canRetry)

        await api.answerExchange(with: .token("issued-token"))
        await model.retry()

        XCTAssertEqual(store.token, "issued-token")
        XCTAssertEqual(signedIn.count, 1)
        let exchanges = await api.exchanges
        XCTAssertEqual(exchanges.map(\.code), ["123456", "123456"])
    }

    func test_F001N_AC1_otherFailuresOfferNoRetry() async {
        let api = StubAPI()
        await api.answerSignIn(with: .status(503))
        let model = model(api)
        model.email = "owner@example.com"

        await model.requestCode()

        XCTAssertEqual(model.failure, .generic)
        XCTAssertFalse(model.canRetry, "the button on screen already tries again")
    }

    // MARK: Screen reader

    func test_F001N_AC15_failuresAndLoadingAreAnnounced() async {
        let api = StubAPI()
        await api.answerExchange(with: .unauthorized)
        let announcements = Announcements()
        let model = await modelOnCodeStep(api, announcements: announcements)
        let catalog = TestCatalog(language)
        XCTAssertEqual(announcements.texts, [catalog["common.loading"]], "sending the email is announced")

        model.enterCode("000000")
        await model.submitCode()

        XCTAssertEqual(
            announcements.texts,
            [catalog["common.loading"], catalog["common.loading"], catalog["signIn.errors.invalidOrExpiredCode"]]
        )
    }

    func test_F001N_AC6_errorIsAnnounced() async {
        let api = StubAPI()
        await api.answerSignIn(with: .badRequest)
        let announcements = Announcements()
        let model = model(api, announcements: announcements)
        model.email = "owner@example.com"

        await model.requestCode()

        XCTAssertEqual(announcements.texts.last, TestCatalog(language)["signIn.errors.invalidEmail"])
    }
}
