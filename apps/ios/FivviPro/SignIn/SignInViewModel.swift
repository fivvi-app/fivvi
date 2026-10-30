import Foundation
import Observation
import SwiftUI
import OpenAPIRuntime
import FivviAPI

/// TM-01, the sign-in screen: the email step and the code step (F001, spec #168). It asks the API for the sign-in email
/// and exchanges the code from it for a bearer token, both through the generated client's `APIProtocol`, and keeps the
/// token in the session store. The code step can ask for a new email (`resendCode()`), go back to change the address
/// (`changeEmail()`) and, when the connection was lost, try again (`retry()`).
@MainActor
@Observable
final class SignInViewModel {
    enum State: Equatable {
        case enteringEmail
        case sendingCode
        case enteringCode
        case checkingCode
        /// A new sign-in email is on its way, from the code step.
        case resendingCode
    }

    /// What went wrong at the last step; shown as one message, cleared by the next attempt.
    enum Failure: Error, Equatable {
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

    /// What `retry()` does again after a lost connection.
    private enum Attempt {
        case requestCode
        case submitCode
        case resendCode
    }

    /// The length of the code in the email.
    static let codeLength = 6

    private(set) var state = State.enteringEmail
    private(set) var failure: Failure?
    /// A new email was sent from the code step; the step says so until the next attempt.
    private(set) var codeResent = false
    /// The address field; the view binds to it.
    var email = ""
    /// The code field: digits only, at most six (`enterCode(_:)`).
    private(set) var code = ""
    /// The API stopped accepting the token: the screen says so above the form.
    let showsSignedOutNotice: Bool
    private(set) var catalog: Catalog
    private let api: any APIProtocol
    private let store: any SessionStore
    private let onSignedIn: () -> Void
    private let announce: @MainActor (String) -> Void
    /// The address the sign-in email went to, which the code step names and the exchange sends.
    private var requestedEmail = ""
    /// What the last failure was in the middle of, for `retry()`.
    private var failedAttempt: Attempt?

    /// `announce` tells a screen reader about a change it can't see (a spinner, a message that appears); the app posts
    /// an accessibility announcement, tests record the texts.
    init(
        api: any APIProtocol,
        store: any SessionStore,
        catalog: Catalog,
        showsSignedOutNotice: Bool,
        onSignedIn: @escaping () -> Void,
        announce: @escaping @MainActor (String) -> Void = { AccessibilityNotification.Announcement($0).post() }
    ) {
        self.api = api
        self.store = store
        self.catalog = catalog
        self.showsSignedOutNotice = showsSignedOutNotice
        self.onSignedIn = onSignedIn
        self.announce = announce
    }

    /// The interface language changed (the switch on TM-01): the screen and the `locale` of the next sign-in email follow.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
    }

    var isCodeComplete: Bool { code.count == Self.codeLength }

    /// The message for the last failure, from the catalog.
    var failureText: String? { failure.map { catalog[$0.key] } }

    /// A lost connection can be tried again, whatever the screen was doing; other failures are tried again with the
    /// step's own button.
    var canRetry: Bool { failure == .noConnection && failedAttempt != nil }

    /// "If <address> is registered, you'll receive a new email." after a resend; like the first answer, it never says
    /// whether the address has an account.
    var resentText: String? { codeResent ? catalog.string(.signInResent, requestedEmail) : nil }

    /// "If <address> is registered, you'll receive an email with a code." The answer is the same for every address.
    var checkEmailText: String { catalog.string(.signInCheckEmailBodyApp, requestedEmail) }

    /// Asks for the sign-in email, in the app's language, and moves to the code step. The API answers the same for
    /// every address, so the step never says whether the address has an account.
    func requestCode() async {
        guard state == .enteringEmail else { return }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else {
            fail(.invalidEmail, back: .enteringEmail)
            return
        }
        begin(.sendingCode)
        switch await sendSignInEmail(to: address) {
        case .success:
            requestedEmail = address
            code = ""
            state = .enteringCode
        case let .failure(failure):
            fail(failure, back: .enteringEmail, attempt: .requestCode)
        }
    }

    /// Asks for a new sign-in email to the same address, from the code step (the API makes the earlier code stop
    /// working). The code field is ready for the new code.
    func resendCode() async {
        guard state == .enteringCode else { return }
        begin(.resendingCode)
        switch await sendSignInEmail(to: requestedEmail) {
        case .success:
            code = ""
            state = .enteringCode
            codeResent = true
            announce(catalog.string(.signInResent, requestedEmail))
        case let .failure(failure):
            fail(failure, back: .enteringCode, attempt: .resendCode)
        }
    }

    /// Goes back to the email step, with the address kept so it can be corrected.
    func changeEmail() {
        guard state == .enteringCode else { return }
        code = ""
        failure = nil
        failedAttempt = nil
        codeResent = false
        state = .enteringEmail
    }

    /// Does again what the lost connection interrupted.
    func retry() async {
        guard canRetry, let attempt = failedAttempt else { return }
        switch attempt {
        case .requestCode: await requestCode()
        case .submitCode: await submitCode()
        case .resendCode: await resendCode()
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
        begin(.checkingCode)
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
            fail(Self.failure(for: error), back: .enteringCode, attempt: .submitCode)
        }
    }

    /// The start of a request: the last message goes, a screen reader hears that something is loading.
    private func begin(_ state: State) {
        failure = nil
        failedAttempt = nil
        codeResent = false
        self.state = state
        announce(catalog[.commonLoading])
    }

    /// Asks the API for the sign-in email, in the app's language.
    private func sendSignInEmail(to address: String) async -> Result<Void, Failure> {
        do {
            switch try await api.requestSignIn(body: .json(.init(email: address, locale: catalog.locale))) {
            case .accepted: return .success(())
            case .badRequest: return .failure(.invalidEmail)
            case .internalServerError, .undocumented: return .failure(.generic)
            }
        } catch {
            return .failure(Self.failure(for: error))
        }
    }

    /// Shows `failure` on step `state`. A lost connection remembers the `attempt`, so `retry()` can repeat it.
    private func fail(_ failure: Failure, back state: State, attempt: Attempt? = nil) {
        self.failure = failure
        failedAttempt = attempt
        self.state = state
        announce(catalog[failure.key])
    }

    /// A transport error (no network, a timeout) is "no connection"; anything else is a general failure.
    private static func failure(for error: any Error) -> Failure {
        let cause = (error as? ClientError)?.underlyingError ?? error
        return cause is URLError ? .noConnection : .generic
    }
}
