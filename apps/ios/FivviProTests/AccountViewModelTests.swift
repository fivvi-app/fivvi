import XCTest

@testable import FivviPro

/// The signed-in home's account line: `GET /api/v1/me` through the generated client's `APIProtocol`.
@MainActor
final class AccountViewModelTests: XCTestCase {
    /// How often the app was told the person signed out, and whether the API had refused the token each time.
    private final class SignedOut: @unchecked Sendable {
        private(set) var rejections: [Bool] = []
        var count: Int { rejections.count }
        func record(afterRejection: Bool) { rejections.append(afterRejection) }
    }

    private let clock = ManualClock()

    private func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(token: "stored-token"),
        signedOut: SignedOut = SignedOut()
    ) -> AccountViewModel {
        AccountViewModel(
            api: api, store: store, clock: clock, signOutTimeout: .seconds(10),
            onSignedOut: { signedOut.record(afterRejection: $0) }
        )
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

    func test_F001N_AC10_signOutRefusedByTheApiShowsTheNotice() async {
        let api = StubAPI()
        await api.answerSignOut(with: .unauthorized)
        let signedOut = SignedOut()

        await model(api, signedOut: signedOut).signOut()

        XCTAssertEqual(signedOut.rejections, [true])
    }

    func test_F001N_AC10_aSignOutThatAnswersInTimeStopsTheTimer() async {
        let api = StubAPI()
        await api.answerSignOut(with: .hang)
        let signedOut = SignedOut()
        let model = model(api, signedOut: signedOut)

        let signingOut = Task { await model.signOut() }
        await api.untilSignOutHangs()
        await clock.untilSleeping()
        XCTAssertEqual(clock.sleeping, 1, "the timer is waiting")

        await api.releaseHangingSignOuts()
        await signingOut.value

        XCTAssertEqual(signedOut.rejections, [false])
        XCTAssertEqual(clock.sleeping, 0, "the answer cancelled the timer")
    }

    func test_F001N_AC10_signOutWithoutATokenSkipsTheRequest() async {
        let api = StubAPI()
        let signedOut = SignedOut()

        await model(api, store: InMemorySessionStore(), signedOut: signedOut).signOut()

        let calls = await api.signOutCalls
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(signedOut.rejections, [false])
    }

    /// The connection hangs: the token is gone at once (an app killed meanwhile reopens signed out), and the cap ends
    /// the wait while the request is still waiting for its answer.
    func test_F001N_AC10_signOutDeletesTheTokenAtOnceAndDoesNotWaitForAHangingConnection() async {
        let api = StubAPI()
        await api.answerSignOut(with: .hang)
        let store = InMemorySessionStore(token: "stored-token")
        let signedOut = SignedOut()
        let model = model(api, store: store, signedOut: signedOut)

        let signingOut = Task { await model.signOut() }
        await api.untilSignOutHangs()
        await clock.untilSleeping()

        XCTAssertNil(store.token, "deleted before the wait")
        XCTAssertEqual(signedOut.count, 0, "the wait is not over")
        XCTAssertTrue(model.isSigningOut)

        clock.advance(by: .seconds(9))
        XCTAssertEqual(clock.sleeping, 1, "the timer is still waiting: 9 s is within the cap")
        XCTAssertEqual(signedOut.count, 0)

        clock.advance(by: .seconds(1))
        XCTAssertEqual(clock.sleeping, 0, "the timer has run out: the cap is 10 s")
        await signingOut.value

        XCTAssertEqual(signedOut.rejections, [false])
        XCTAssertFalse(model.isSigningOut)
        let hanging = await api.hangingSignOuts
        XCTAssertEqual(hanging, 1, "the request is still waiting for its answer")
        await api.releaseHangingSignOuts()
    }

    func test_F001N_AC10_aSecondTapWhileSigningOutIsIgnored() async {
        let api = StubAPI()
        await api.answerSignOut(with: .hang)
        let signedOut = SignedOut()
        let model = model(api, signedOut: signedOut)

        let first = Task { await model.signOut() }
        await api.untilSignOutHangs()
        await clock.untilSleeping()
        XCTAssertTrue(model.isSigningOut)

        await model.signOut()

        let calls = await api.signOutCalls
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(signedOut.count, 0, "the second tap does not end the first sign-out")

        await api.releaseHangingSignOuts()
        await first.value

        XCTAssertEqual(signedOut.count, 1)
    }
}
