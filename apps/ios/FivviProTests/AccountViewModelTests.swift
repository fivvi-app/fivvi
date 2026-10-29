import FivviAPI
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

    /// The account IDs the home passed on for error reporting.
    private final class Identified: @unchecked Sendable {
        private(set) var ids: [String] = []
        func record(_ id: String) { ids.append(id) }
    }

    private let clock = ManualClock()
    private let identified = Identified()

    private func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(token: "stored-token"),
        signedOut: SignedOut = SignedOut()
    ) -> AccountViewModel {
        AccountViewModel(
            api: api, store: store, clock: clock, signOutTimeout: .seconds(10),
            onAccount: { [identified] in identified.record($0) },
            onSignedOut: { signedOut.record(afterRejection: $0) }
        )
    }

    // MARK: Error-reporting user (AC2, #266)

    func test_F001N_266_AC2_passesTheAccountIdOnOnceTheApiHasAnswered() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "owner@example.com", id: "0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f"))
        let model = model(api)
        XCTAssertEqual(identified.ids, [])

        await model.load()

        XCTAssertEqual(identified.ids, ["0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f"])
    }

    func test_F001N_266_AC2_passesNothingOnWhenTheApiDoesNotAnswerWithTheAccount() async {
        let api = StubAPI()
        for answer in [StubAPI.MeAnswer.offline, .unauthorized, .status(503)] {
            await api.answerMe(with: answer)

            await model(api).load()
        }

        XCTAssertEqual(identified.ids, [])
    }

    func test_F001N_266_AC3_anAnswerAfterTheSignOutPassesNothingOn() async {
        let api = StubAPI()
        await api.answerMe(with: .hang)
        let store = InMemorySessionStore(token: "stored-token")
        let model = model(api, store: store)
        let loading = Task { await model.load() }
        await api.untilMeHangs()

        await model.signOut()
        await api.releaseHangingMes()
        await loading.value

        XCTAssertEqual(identified.ids, [])
    }

    func test_F001N_266_AC3_anAnswerToAScreenThatIsGonePassesNothingOn() async {
        let api = StubAPI()
        await api.answerMe(with: .hang)
        let model = model(api)
        let loading = Task { await model.load() }
        await api.untilMeHangs()

        loading.cancel()
        await api.releaseHangingMes()
        await loading.value

        XCTAssertEqual(identified.ids, [])
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

    // MARK: Home state (F002 AC10)

    /// The three states of the home come from `GET /api/v1/me`, in both languages: the workspace's name, the text to
    /// set one up on the web, or the no-access text. The app decides nothing: the API's workspaces and
    /// `canCreateWorkspace` do.
    func test_F002_AC10_homeStateFromMe() async {
        let cases: [(StubAPI.MeAnswer, AccountViewModel.Destination)] = [
            (.account(email: "owner@example.com", workspaces: ["John's Gym"]), .workspace(name: "John's Gym")),
            (.account(email: "owner@example.com", workspaces: ["John's Gym"], canCreateWorkspace: true),
             .workspace(name: "John's Gym")),
            (.account(email: "owner@example.com", canCreateWorkspace: true), .setUpOnWeb),
            (.account(email: "owner@example.com"), .noAccess)
        ]
        for (answer, destination) in cases {
            let api = StubAPI()
            await api.answerMe(with: answer)
            let model = model(api)
            XCTAssertNil(model.destination, "nothing is decided before the API answers")

            await model.load()

            XCTAssertEqual(model.destination, destination, "\(answer)")
        }
        for locale in [Components.Schemas.Locale.nlNL, .en] {
            let catalog = Catalog(locale: locale)
            let expected = TestCatalog(locale)
            XCTAssertEqual(catalog[.setUpOnWeb], expected["home.setUpOnWeb"])
            XCTAssertEqual(catalog[.openWeb], expected["home.openWeb"])
            XCTAssertEqual(catalog[.noAccessTitle], expected["noAccess.title"])
            XCTAssertEqual(catalog[.noAccessBody], expected["noAccess.body"])
        }
    }

    func test_F002_AC10_aFailedAnswerDecidesNothing() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "owner@example.com", workspaces: ["John's Gym"]))
        let model = model(api)
        await model.load()

        await api.answerMe(with: .offline)
        await model.load()

        XCTAssertNil(model.destination, "a retry shows no state of the earlier answer")
        XCTAssertEqual(model.state, .failed)
    }

    /// The button opens trainer web's first-run screen: the API's base URL without its `/api` mount, plus `/welcome`.
    func test_F002_AC10_theWebButtonOpensWelcomeOnTheWebApp() throws {
        for (api, web) in [
            ("http://localhost:3000/api", "http://localhost:3000/welcome"),
            ("https://fivvi.example.com/api", "https://fivvi.example.com/welcome"),
            ("http://127.0.0.1:3383/api/", "http://127.0.0.1:3383/welcome")
        ] {
            XCTAssertEqual(AppConfiguration.welcomeURL(apiBaseURL: try XCTUnwrap(URL(string: api))).absoluteString, web)
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
