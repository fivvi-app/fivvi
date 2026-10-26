import FivviAPI
import XCTest

@testable import FivviPro

/// TM-01's states against a stub of the generated client's `APIProtocol`. The test plan runs every test in nl and en.
@MainActor
final class SignInViewModelTests: XCTestCase {
    /// The app's interface language in this test-plan configuration.
    private let language = InterfaceLanguage.resolve(.system())
    private lazy var catalog = Catalog(locale: language)

    private final class SignedIn: @unchecked Sendable {
        private(set) var count = 0
        func bump() { count += 1 }
    }

    private func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(), signedIn: SignedIn = SignedIn(),
        afterRejection: Bool = false
    ) -> SignInViewModel {
        SignInViewModel(
            api: api, store: store, catalog: catalog, showsSignedOutNotice: afterRejection,
            onSignedIn: { signedIn.bump() }
        )
    }

    func test_F001N_AC1_requestSendsAppLanguage() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = StubAPI()
        let model = model(api)
        XCTAssertEqual(model.state, .enteringEmail)
        model.email = "  owner@example.com "

        await model.requestCode()

        let requests = await api.signInRequests
        XCTAssertEqual(requests.map(\.email), ["owner@example.com"], "the address, trimmed")
        XCTAssertEqual(requests.map(\.locale.value1), [language])
        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertNil(model.failure)
    }

    func test_F001N_AC1_noAddressMakesNoRequest() async {
        let api = StubAPI()
        let model = model(api)
        model.email = "   "

        await model.requestCode()

        let requests = await api.signInRequests
        XCTAssertTrue(requests.isEmpty)
        XCTAssertEqual(model.state, .enteringEmail)
        XCTAssertEqual(model.failure, .invalidEmail)
    }

    func test_F001N_AC1_failuresStayOnTheEmailStep() async {
        let cases: [(StubAPI.SignInAnswer, SignInViewModel.Failure)] = [
            (.badRequest, .invalidEmail), (.offline, .noConnection), (.status(503), .generic)
        ]
        for (answer, failure) in cases {
            let api = StubAPI()
            await api.answerSignIn(with: answer)
            let model = model(api)
            model.email = "owner@example.com"

            await model.requestCode()

            XCTAssertEqual(model.state, .enteringEmail, "\(answer)")
            XCTAssertEqual(model.failure, failure, "\(answer)")
        }
    }

    func test_F001N_AC3_codeStoresTokenAndShowsHome() async throws {
        let api = StubAPI()
        await api.answerExchange(with: .token("issued-token"))
        let store = InMemorySessionStore()
        let signedIn = SignedIn()
        let model = model(api, store: store, signedIn: signedIn)
        model.email = "owner@example.com"
        await model.requestCode()

        model.enterCode("123456")
        XCTAssertTrue(model.isCodeComplete)
        await model.submitCode()

        let exchanges = await api.exchanges
        XCTAssertEqual(exchanges.map(\.email), ["owner@example.com"])
        XCTAssertEqual(exchanges.map(\.code), ["123456"])
        XCTAssertEqual(store.token, "issued-token")
        XCTAssertEqual(signedIn.count, 1)
    }

    func test_F001N_AC3_codeFieldTakesSixDigitsOnly() {
        let model = model(StubAPI())

        model.enterCode("12a3 4-5")
        XCTAssertEqual(model.code, "12345")
        XCTAssertFalse(model.isCodeComplete)

        model.enterCode("1234567890")
        XCTAssertEqual(model.code, "123456", "a pasted code is cut to six digits")
        XCTAssertTrue(model.isCodeComplete)

        model.enterCode("١٢٣٤٥٦")
        XCTAssertEqual(model.code, "", "only the digits 0 to 9, which the API accepts")
    }

    func test_F001N_AC3_incompleteCodeIsNotSent() async {
        let api = StubAPI()
        let model = model(api)
        model.email = "owner@example.com"
        await model.requestCode()
        model.enterCode("12345")

        await model.submitCode()

        let exchanges = await api.exchanges
        XCTAssertTrue(exchanges.isEmpty)
        XCTAssertEqual(model.state, .enteringCode)
    }

    func test_F001N_AC6_wrongCodeShowsNeutralMessage() async {
        let api = StubAPI()
        await api.answerExchange(with: .unauthorized)
        let store = InMemorySessionStore()
        let signedIn = SignedIn()
        let model = model(api, store: store, signedIn: signedIn)
        model.email = "owner@example.com"
        await model.requestCode()
        model.enterCode("000000")

        await model.submitCode()

        XCTAssertEqual(model.state, .enteringCode, "the code field is ready for another try")
        XCTAssertEqual(model.failure, .wrongCode)
        XCTAssertEqual(model.code, "")
        XCTAssertNil(store.token)
        XCTAssertEqual(signedIn.count, 0)
        XCTAssertEqual(
            model.catalog[.signInErrorsInvalidOrExpiredCode],
            TestCatalog(language)["signIn.errors.invalidOrExpiredCode"]
        )
    }

    func test_F001N_AC3_codeFailuresStayOnTheCodeStep() async {
        let cases: [(StubAPI.ExchangeAnswer, SignInViewModel.Failure)] = [
            (.offline, .noConnection), (.status(503), .generic), (.badRequest, .generic)
        ]
        for (answer, failure) in cases {
            let api = StubAPI()
            await api.answerExchange(with: answer)
            let model = model(api)
            model.email = "owner@example.com"
            await model.requestCode()
            model.enterCode("123456")

            await model.submitCode()

            XCTAssertEqual(model.state, .enteringCode, "\(answer)")
            XCTAssertEqual(model.failure, failure, "\(answer)")
        }
    }

    func test_F001N_AC3_aTokenThatCannotBeStoredIsNotASignIn() async {
        let api = StubAPI()
        await api.answerExchange(with: .token("issued-token"))
        let store = InMemorySessionStore()
        store.failSaving(with: SessionStoreError.keychain(errSecInteractionNotAllowed))
        let signedIn = SignedIn()
        let model = model(api, store: store, signedIn: signedIn)
        model.email = "owner@example.com"
        await model.requestCode()
        model.enterCode("123456")

        await model.submitCode()

        XCTAssertEqual(model.state, .enteringCode)
        XCTAssertEqual(model.failure, .generic)
        XCTAssertEqual(signedIn.count, 0)
    }

    func test_F001N_AC9_noticeAfterTheTokenWasRejected() {
        XCTAssertFalse(model(StubAPI()).showsSignedOutNotice)
        XCTAssertTrue(model(StubAPI(), afterRejection: true).showsSignedOutNotice)
        XCTAssertEqual(
            catalog[.signInSignedOutNotice], TestCatalog(language)["signIn.signedOutNotice"]
        )
    }

    func test_F001N_AC1_checkEmailBodyNamesTheAddress() async {
        let model = model(StubAPI())
        model.email = "owner@example.com"
        await model.requestCode()

        XCTAssertEqual(
            model.checkEmailText,
            String(format: TestCatalog(language)["signIn.checkEmailBodyApp"], "owner@example.com")
        )
    }
}
