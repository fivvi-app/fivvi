import FivviAPI
import XCTest

@testable import FivviPro

/// The hello screen's states. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class HelloViewModelTests: XCTestCase {
    /// The app's interface language in this test-plan configuration.
    private let language = InterfaceLanguage.resolve(.system())

    private func model(_ api: StubAPI) -> HelloViewModel {
        HelloViewModel(api: api, catalog: Catalog(locale: language))
    }

    func test_E008_AC1_loadsGreetingInAppLanguage() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = StubAPI(.greeting(key: "hello.title"))
        let model = model(api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        let requested = await api.requestedLocales
        XCTAssertEqual(requested, [language])
        XCTAssertEqual(model.state, .loaded(greeting: TestCatalog(language)["hello.title"]))
    }

    func test_E008_AC4_networkErrorShowsRetry() async {
        let model = model(StubAPI(.offline))

        await model.load()

        XCTAssertEqual(model.state, .failed)
    }

    func test_E008_AC4_serverErrorShowsRetry() async {
        let model = model(StubAPI(.status(503)))

        await model.load()

        XCTAssertEqual(model.state, .failed)
    }

    func test_E008_AC4_unknownKeyFails() async {
        let model = model(StubAPI(.greeting(key: "hello.notAKey")))

        await model.load()

        XCTAssertEqual(model.state, .failed)
    }

    func test_E008_AC4_retryLoadsGreeting() async {
        let api = StubAPI(.offline)
        let model = model(api)
        await model.load()
        XCTAssertEqual(model.state, .failed)

        await api.answer(with: .greeting(key: "hello.title"))
        await model.load()

        XCTAssertEqual(model.state, .loaded(greeting: TestCatalog(language)["hello.title"]))
        let requested = await api.requestedLocales
        XCTAssertEqual(requested, [language, language])
    }
}
