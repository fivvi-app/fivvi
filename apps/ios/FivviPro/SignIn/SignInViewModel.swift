import Foundation
import Observation
import OpenAPIRuntime
import FivviAPI

/// TM-01, the sign-in screen: the email step and the code step (F001, spec #168). It asks the API for the sign-in email
/// and exchanges the code from it for a bearer token, both through the generated client's `APIProtocol`, and keeps the
/// token in the session store.
@MainActor
@Observable
final class SignInViewModel {
    enum State: Equatable {
        case enteringEmail
        case sendingCode
        case enteringCode
        case checkingCode
    }

    /// What went wrong at the last step; shown as one message, cleared by the next attempt.
    enum Failure: Equatable {
        case invalidEmail
        /// A wrong, used, replaced or expired code: one neutral message for all of them.
        case wrongCode
        case noConnection
        case generic

        fileprivate var key: StringKey {
            switch self {
            case .invalidEmail: .signInErrorsInvalidEmail
            case .wrongCode: .signInErrorsInvalidOrExpiredCode
            case .noConnection: .signInErrorsNoConnection
            case .generic: .signInErrorsGeneric
            }
        }
    }

    /// The length of the code in the email.
    static let codeLength = 6

    private(set) var state = State.enteringEmail
    private(set) var failure: Failure?
    /// The address field; the view binds to it.
    var email = ""
    /// The code field: digits only, at most six (`enterCode(_:)`).
    private(set) var code = ""
    /// The API stopped accepting the token: the screen says so above the form.
    let showsSignedOutNotice: Bool
    let catalog: Catalog
    private let api: any APIProtocol
    private let store: any SessionStore
    private let onSignedIn: () -> Void
    /// The address the sign-in email went to, which the code step names and the exchange sends.
    private var requestedEmail = ""

    init(
        api: any APIProtocol,
        store: any SessionStore,
        catalog: Catalog,
        showsSignedOutNotice: Bool,
        onSignedIn: @escaping () -> Void
    ) {
        self.api = api
        self.store = store
        self.catalog = catalog
        self.showsSignedOutNotice = showsSignedOutNotice
        self.onSignedIn = onSignedIn
    }

    var isCodeComplete: Bool { code.count == Self.codeLength }

    /// The message for the last failure, from the catalog.
    var failureText: String? { failure.map { catalog[$0.key] } }

    /// "If <address> is registered, you'll receive an email with a code." The answer is the same for every address.
    var checkEmailText: String { catalog.string(.signInCheckEmailBodyApp, requestedEmail) }

    /// Asks for the sign-in email, in the app's language, and moves to the code step. The API answers the same for
    /// every address, so the step never says whether the address has an account.
    func requestCode() async {
        guard state == .enteringEmail else { return }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else {
            failure = .invalidEmail
            return
        }
        failure = nil
        state = .sendingCode
        do {
            // The contract wraps the locale in an `allOf` (a $ref plus its description), which the generator turns into a
            // payload with the locale as `value1`; `value2` is the description's empty object and is not sent.
            let locale = Components.Schemas.SignInRequest.LocalePayload(value1: catalog.locale, value2: try .init())
            let output = try await api.requestSignIn(body: .json(.init(email: address, locale: locale)))
            switch output {
            case .accepted:
                requestedEmail = address
                code = ""
                state = .enteringCode
            case .badRequest:
                fail(.invalidEmail, back: .enteringEmail)
            case .internalServerError, .undocumented:
                fail(.generic, back: .enteringEmail)
            }
        } catch {
            fail(Self.failure(for: error), back: .enteringEmail)
        }
    }

    /// Takes what the code field holds now: the digits 0 to 9, at most six (a pasted code is cut to six).
    func enterCode(_ input: String) {
        code = String(input.filter { $0.isASCII && $0.isWholeNumber }.prefix(Self.codeLength))
    }

    /// Exchanges the code for the bearer token, stores it and hands over to the signed-in home. A code that does not
    /// work leaves the code step ready for another try.
    func submitCode() async {
        guard state == .enteringCode, isCodeComplete else { return }
        failure = nil
        state = .checkingCode
        do {
            let output = try await api.exchangeSignInCode(body: .json(.init(email: requestedEmail, code: code)))
            switch output {
            case let .ok(response):
                try store.save(token: try response.body.json.token)
                code = ""
                state = .enteringCode
                onSignedIn()
            case .unauthorized:
                code = ""
                fail(.wrongCode, back: .enteringCode)
            case .badRequest, .internalServerError, .undocumented:
                fail(.generic, back: .enteringCode)
            }
        } catch {
            fail(Self.failure(for: error), back: .enteringCode)
        }
    }

    private func fail(_ failure: Failure, back state: State) {
        self.failure = failure
        self.state = state
    }

    /// A transport error (no network, a timeout) is "no connection"; anything else is a general failure.
    private static func failure(for error: any Error) -> Failure {
        let cause = (error as? ClientError)?.underlyingError ?? error
        return cause is URLError ? .noConnection : .generic
    }
}
