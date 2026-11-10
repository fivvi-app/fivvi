import FivviAPI
import HTTPTypes
import OpenAPIRuntime
import XCTest

/// #371: the body of `PATCH /v1/me` as the generated Swift client writes it for the language save of `AppLanguage`.
/// The API reads `null` as a value and refuses it (`400`), so a request carries only what the app set. Swift leaves a
/// `nil` field out; the Kotlin client does the same since #371 (`UpdateMeRequestTest` asserts the same literal). The
/// request goes through the real generated `Client` and its JSON encoding, with a transport that records the body.
final class UpdateMeRequestTests: XCTestCase {
    private final class BodyTransport: ClientTransport, @unchecked Sendable {
        private let lock = NSLock()
        private var bodies: [String] = []

        var body: String? { lock.withLock { bodies.first } }

        func send(
            _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
        ) async throws -> (HTTPResponse, HTTPBody?) {
            var text = ""
            if let body { text = try await String(collecting: body, upTo: 4096) }
            lock.withLock { bodies.append(text) }
            var response = HTTPResponse(status: .ok)
            response.headerFields[.contentType] = "application/json"
            let answer = #"{"id":"3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10","email":"anna@example.com","name":null,"#
                + #""preferredLocale":"en","bookingEmails":true,"canCreateWorkspace":false,"workspaces":[]}"#
            return (response, HTTPBody(answer))
        }
    }

    func test_F010_AC1_theLanguageSaveWritesOnlyTheFieldsTheAppSet() async throws {
        let transport = BodyTransport()
        let api = Client(serverURL: URL(string: "https://example.com/api")!, transport: transport)

        _ = try await api.updateMe(
            body: .json(.init(preferredLocale: .init(rawValue: "en"), surface: .ios))
        ).ok

        let data = try XCTUnwrap(transport.body).data(using: .utf8)!
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(body.keys), ["preferredLocale", "surface"])
        XCTAssertEqual(body["preferredLocale"] as? String, "en")
        XCTAssertEqual(body["surface"] as? String, "ios")
    }
}
