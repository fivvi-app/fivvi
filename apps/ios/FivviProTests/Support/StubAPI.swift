import Foundation
import OpenAPIRuntime
import FivviAPI

/// A stub of the generated client's `APIProtocol`, the view models' test seam (#34). It records what it was asked.
actor StubAPI: APIProtocol {
    enum Answer: Sendable {
        case greeting(key: String)
        case status(Int)
        case offline
    }

    /// What `requestSignIn` answers.
    enum SignInAnswer: Sendable {
        case accepted
        case badRequest
        case status(Int)
        case offline
    }

    /// What `exchangeSignInCode` answers.
    enum ExchangeAnswer: Sendable {
        case token(String)
        case unauthorized
        case badRequest
        case status(Int)
        case offline
    }

    /// What `getMe` answers.
    enum MeAnswer: Sendable {
        case account(email: String)
        case unauthorized
        case status(Int)
        case offline
    }

    /// What `signOut` answers.
    enum SignOutAnswer: Sendable {
        case noContent
        case unauthorized
        case status(Int)
        case offline
        /// No answer for two seconds, as a connection that hangs.
        case hang
    }

    private var answer: Answer
    private var signOutAnswer = SignOutAnswer.noContent
    private var signInAnswer = SignInAnswer.accepted
    private var exchangeAnswer = ExchangeAnswer.unauthorized
    private var meAnswer = MeAnswer.unauthorized
    private(set) var requestedLocales: [Components.Schemas.Locale?] = []
    /// The bodies of every `requestSignIn`, `exchangeSignInCode` and the number of `getMe` calls so far.
    private(set) var signInRequests: [Components.Schemas.SignInRequest] = []
    private(set) var exchanges: [Components.Schemas.SignInTokenRequest] = []
    private(set) var meCalls = 0
    private(set) var signOutCalls = 0

    init(_ answer: Answer = .offline) {
        self.answer = answer
    }

    func answerSignIn(with answer: SignInAnswer) {
        signInAnswer = answer
    }

    func answerExchange(with answer: ExchangeAnswer) {
        exchangeAnswer = answer
    }

    func answerSignOut(with answer: SignOutAnswer) {
        signOutAnswer = answer
    }

    func answerMe(with answer: MeAnswer) {
        meAnswer = answer
    }

    func answer(with answer: Answer) {
        self.answer = answer
    }

    func getHello(_ input: Operations.GetHello.Input) async throws -> Operations.GetHello.Output {
        requestedLocales.append(input.query.locale)
        switch answer {
        case let .greeting(key):
            return .ok(.init(body: .json(.init(greetingKey: key, locale: input.query.locale ?? .en))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func getHealth(_ input: Operations.GetHealth.Input) async throws -> Operations.GetHealth.Output {
        fatalError("The hello screen doesn't call getHealth")
    }

    func getMe(_ input: Operations.GetMe.Input) async throws -> Operations.GetMe.Output {
        meCalls += 1
        switch meAnswer {
        case let .account(email):
            return .ok(.init(body: .json(.init(id: "2f6a1f0e-0000-4000-8000-000000000001", email: email))))
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .unauthorized))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func requestSignIn(_ input: Operations.RequestSignIn.Input) async throws -> Operations.RequestSignIn.Output {
        if case let .json(body) = input.body { signInRequests.append(body) }
        switch signInAnswer {
        case .accepted:
            return .accepted(.init())
        case .badRequest:
            return .badRequest(.init(body: .json(.init(code: .validationFailed, issues: []))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func exchangeSignInCode(
        _ input: Operations.ExchangeSignInCode.Input
    ) async throws -> Operations.ExchangeSignInCode.Output {
        if case let .json(body) = input.body { exchanges.append(body) }
        switch exchangeAnswer {
        case let .token(token):
            return .ok(.init(body: .json(.init(token: token))))
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .unauthorized))))
        case .badRequest:
            return .badRequest(.init(body: .json(.init(code: .validationFailed, issues: []))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func signOut(_ input: Operations.SignOut.Input) async throws -> Operations.SignOut.Output {
        signOutCalls += 1
        switch signOutAnswer {
        case .noContent:
            return .noContent(.init())
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .unauthorized))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        case .hang:
            try await Task.sleep(for: .seconds(2))
            return .noContent(.init())
        }
    }
}
