import Foundation
import HTTPTypes
import OpenAPIRuntime

/// A `ClientTransport` that answers every request with one status and body (JSON unless told otherwise; none when
/// empty) and records what it was sent, so a test drives the real generated `Client` (and its middlewares) without a
/// network.
final class StubTransport: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private let status: HTTPResponse.Status
    private let json: String
    private let contentType: String
    private var sent: [HTTPRequest] = []
    private var beforeAnswering: (@Sendable () -> Void)?

    init(status: HTTPResponse.Status = .ok, json: String = "", contentType: String = "application/json") {
        self.status = status
        self.json = json
        self.contentType = contentType
    }

    /// Every request received so far.
    var requests: [HTTPRequest] { lock.withLock { sent } }

    /// Runs `action` after a request arrives and before the answer is returned, e.g. to sign in meanwhile.
    func onRequest(_ action: @escaping @Sendable () -> Void) {
        lock.withLock { beforeAnswering = action }
    }

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let action = lock.withLock {
            sent.append(request)
            return beforeAnswering
        }
        action?()
        var response = HTTPResponse(status: status)
        guard !json.isEmpty else { return (response, nil) }
        response.headerFields[.contentType] = contentType
        return (response, HTTPBody(json))
    }
}
