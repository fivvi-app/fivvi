import XCTest

@testable import FivviPro

/// The signed-in home's account line: `GET /api/v1/me` through the generated client's `APIProtocol`.
@MainActor
final class AccountViewModelTests: XCTestCase {
    /// How often the app was told the person signed out.
    private final class SignedOut: @unchecked Sendable {
        private(set) var count = 0
        func bump() { count += 1 }
    }

    private func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(token: "stored-token"),
        signedOut: SignedOut = SignedOut(), signOutTimeout: Duration = .seconds(10)
    ) -> AccountViewModel {
        AccountViewModel(api: api, store: store, signOutTimeout: signOutTimeout, onSignedOut: { signedOut.bump() })
    }

    func test_F001N_AC4_homeCallsMeAndShowsTheAddress() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "owner@example.com"))
        let model = model(api)
        XCTAssertEqual(model.state, .loading)

        await model.load()

        XCTAssertEqual(model.state, .loaded(email: "owner@example.com"))
        let calls = await api.meCalls
        XCTAssertEqual(calls, 1)
    }

    func test_F001N_AC4_failureShowsRetry() async {
        let api = StubAPI()
        await api.answerMe(with: .offline)
        let model = model(api)

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
            let model = model(api)

            await model.load()

            XCTAssertEqual(model.state, .failed, "\(answer)")
        }
    }

    // MARK: Sign out (AC10)

    func test_F001N_AC10_signOutEndsTheSessionDeletesTheTokenAndShowsSignIn() async {
        let api = StubAPI()
        let store = InMemorySessionStore(token: "stored-token")
        let signedOut = SignedOut()
        let model = model(api, store: store, signedOut: signedOut)

        await model.signOut()

        let calls = await api.signOutCalls
        XCTAssertEqual(calls, 1)
        XCTAssertNil(store.token)
        XCTAssertEqual(signedOut.count, 1)
    }

    func test_F001N_AC10_signOutDeletesTokenEvenOffline() async {
        let answers: [StubAPI.SignOutAnswer] = [.offline, .status(503), .unauthorized]
        for answer in answers {
            let api = StubAPI()
            await api.answerSignOut(with: answer)
            let store = InMemorySessionStore(token: "stored-token")
            let signedOut = SignedOut()
            let model = model(api, store: store, signedOut: signedOut)

            await model.signOut()

            XCTAssertNil(store.token, "\(answer)")
            XCTAssertEqual(signedOut.count, 1, "\(answer)")
        }
    }

    func test_F001N_AC10_signOutDoesNotWaitForAHangingConnection() async {
        let api = StubAPI()
        await api.answerSignOut(with: .hang)
        let store = InMemorySessionStore(token: "stored-token")
        let signedOut = SignedOut()
        let model = model(api, store: store, signedOut: signedOut, signOutTimeout: .milliseconds(50))

        await model.signOut()

        XCTAssertNil(store.token)
        XCTAssertEqual(signedOut.count, 1)
    }

    func test_F001N_AC10_aSecondTapWhileSigningOutIsIgnored() async {
        let api = StubAPI()
        await api.answerSignOut(with: .hang)
        let signedOut = SignedOut()
        let model = model(api, signedOut: signedOut, signOutTimeout: .milliseconds(200))

        async let first: Void = model.signOut()
        await Task.yield()
        XCTAssertTrue(model.isSigningOut)
        await model.signOut()
        await first

        let calls = await api.signOutCalls
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(signedOut.count, 1)
    }
}
