import Foundation
import OpenAPIRuntime
import FivviAPI

/// A stub of the generated client's `APIProtocol`, the view model's test seam (#34). It records the requested locale.
actor StubAPI: APIProtocol {
    enum Answer: Sendable {
        case greeting(key: String)
        case status(Int)
        case offline
    }

    private var answer: Answer
    private(set) var requestedLocales: [Components.Schemas.Locale?] = []

    init(_ answer: Answer) {
        self.answer = answer
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
        fatalError("The hello screen doesn't call getMe")
    }

    func requestSignIn(_ input: Operations.RequestSignIn.Input) async throws -> Operations.RequestSignIn.Output {
        fatalError("The hello screen doesn't call requestSignIn")
    }

    func exchangeSignInCode(
        _ input: Operations.ExchangeSignInCode.Input
    ) async throws -> Operations.ExchangeSignInCode.Output {
        fatalError("The hello screen doesn't call exchangeSignInCode")
    }

    func signOut(_ input: Operations.SignOut.Input) async throws -> Operations.SignOut.Output {
        fatalError("The hello screen doesn't call signOut")
    }
}
