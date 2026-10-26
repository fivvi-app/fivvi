import Foundation
import HTTPTypes
import OpenAPIRuntime

/// The auth layer on the generated client (ADR-004, ADR-007): adds `Authorization: Bearer <token>` to every request
/// while the app holds a token, and turns a `401` for that token into "signed out": the token is deleted and
/// `onSignedOut` runs. A `401` for a request without a token (the wrong code on the sign-in screen) changes nothing.
/// Transport glue only; the calls and models stay the generated client's.
struct AuthMiddleware: ClientMiddleware {
    let store: any SessionStore
    let onSignedOut: @Sendable () async -> Void

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let token = store.token else { return try await next(request, body, baseURL) }
        var request = request
        request.headerFields[.authorization] = "Bearer \(token)"
        let (response, responseBody) = try await next(request, body, baseURL)
        // Only if the token is still the one that was sent: a late answer for an old token must not sign out a
        // sign-in that happened in the meantime.
        // The compare and the delete are two Keychain calls, not one atomic step; a sign-in landing between them is
        // not expected here (sign-in needs the user), so that is acceptable for now.
        if response.status == .unauthorized, store.token == token {
            store.deleteToken()
            await onSignedOut()
        }
        return (response, responseBody)
    }
}
