import XCTest

@testable import FivviPro

/// The signed-in home's account line: `GET /api/v1/me` through the generated client's `APIProtocol`.
@MainActor
final class AccountViewModelTests: XCTestCase {
    func test_F001N_AC4_homeCallsMeAndShowsTheAddress() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "owner@example.com"))
        let model = AccountViewModel(api: api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        XCTAssertEqual(model.state, .loaded(email: "owner@example.com"))
        let calls = await api.meCalls
        XCTAssertEqual(calls, 1)
    }

    func test_F001N_AC4_failureShowsRetry() async {
        let api = StubAPI()
        await api.answerMe(with: .offline)
        let model = AccountViewModel(api: api)

        await model.load()
        XCTAssertEqual(model.state, .failed)

        await api.answerMe(with: .account(email: "owner@example.com"))
        await model.load()

        XCTAssertEqual(model.state, .loaded(email: "owner@example.com"))
    }

    func test_F001N_AC4_serverErrorsFail() async {
        let api = StubAPI()
        for answer in [StubAPI.MeAnswer.status(503), .unauthorized] {
            await api.answerMe(with: answer)
            let model = AccountViewModel(api: api)

            await model.load()

            XCTAssertEqual(model.state, .failed, "\(answer)")
        }
    }
}
