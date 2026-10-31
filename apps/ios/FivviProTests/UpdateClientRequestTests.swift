import FivviAPI
import HTTPTypes
import OpenAPIRuntime
import XCTest

/// F006 AC7: the edit body of `PATCH /clients/{id}` as the generated Swift client writes it. The synthesized `Codable`
/// leaves out a field that is `nil`; the contract reads a missing field, like a `null`, as "keep", and clears only with
/// `clearEmail` / `clearEmailLocale` (a `nil` email can never mean "clear" here). The request goes through the real
/// generated `Client` and its JSON encoding, with a transport that records the body in place of the network.
final class UpdateClientRequestTests: XCTestCase {
    private let workspace = "0b6d3c1e-5f0a-4c2b-9a41-7a1f2d3e4b50"
    private let client = "3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10"

    /// Records the method, the path and the body of each request, and answers with a client.
    private final class BodyTransport: ClientTransport, @unchecked Sendable {
        private let lock = NSLock()
        private var methods: [HTTPRequest.Method] = []
        private var paths: [String] = []
        private var bodies: [String] = []
        private let answer: String

        init(answeringWith answer: String) { self.answer = answer }

        var method: HTTPRequest.Method? { lock.withLock { methods.first } }
        var path: String? { lock.withLock { paths.first } }
        var body: String? { lock.withLock { bodies.first } }

        func send(
            _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
        ) async throws -> (HTTPResponse, HTTPBody?) {
            var text = ""
            if let body { text = try await String(collecting: body, upTo: 4096) }
            lock.withLock {
                methods.append(request.method)
                paths.append(request.path ?? "")
                bodies.append(text)
            }
            var response = HTTPResponse(status: .ok)
            response.headerFields[.contentType] = "application/json"
            return (response, HTTPBody(answer))
        }
    }

    /// The body the client sends for `request`, parsed as the server reads it.
    private func sent(_ request: Components.Schemas.UpdateClientRequest) async throws -> [String: Any] {
        let transport = BodyTransport(
            answeringWith: #"{"id":"\#(client)","name":"Anna","email":null,"emailLocale":null}"#
        )
        let api = Client(serverURL: URL(string: "https://example.com/api")!, transport: transport)

        _ = try await api.updateClient(
            .init(path: .init(workspaceId: workspace, clientId: client), body: .json(request))
        ).ok

        XCTAssertEqual(transport.method, .patch)
        XCTAssertEqual(transport.path, "/v1/workspaces/\(workspace)/clients/\(client)")
        let data = try XCTUnwrap(transport.body).data(using: .utf8)!
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// What the server reads from `field`: nothing (keep) for a missing field or `null`, else the value.
    private func value(_ field: String, in body: [String: Any]) -> Any? {
        guard let value = body[field], !(value is NSNull) else { return nil }
        return value
    }

    func test_F006_AC7_changingOnlyTheNameKeepsTheEmailAndTheLanguage() async throws {
        let body = try await sent(.init(name: "Anna Visser"))

        // Swift leaves out what was not set ...
        XCTAssertEqual(Set(body.keys), ["name"])
        // ... which the contract reads as "keep": no value and no clear flag.
        XCTAssertEqual(body["name"] as? String, "Anna Visser")
        for field in ["email", "clearEmail", "emailLocale", "clearEmailLocale"] {
            XCTAssertNil(value(field, in: body), field)
        }
    }

    func test_F006_AC7_aNilEmailIsNotAClear() async throws {
        // The reason for the flag: `email: nil` is a missing field in Swift, as it would be for "keep".
        let body = try await sent(.init(name: "Anna", email: nil, emailLocale: nil))

        XCTAssertNil(body["email"])
        XCTAssertNil(body["emailLocale"])
        XCTAssertNil(value("clearEmail", in: body))
        XCTAssertNil(value("clearEmailLocale", in: body))
    }

    func test_F006_AC7_clearingTheEmailIsTheClearFlagAndNoEmail() async throws {
        let body = try await sent(.init(clearEmail: true))

        XCTAssertEqual(body["clearEmail"] as? Bool, true)
        for field in ["name", "email", "emailLocale", "clearEmailLocale"] {
            XCTAssertNil(value(field, in: body), field)
        }
    }

    func test_F006_AC7_resettingTheLanguageIsTheClearFlagAndNoLanguage() async throws {
        let body = try await sent(.init(clearEmailLocale: true))

        XCTAssertEqual(body["clearEmailLocale"] as? Bool, true)
        for field in ["name", "email", "emailLocale", "clearEmail"] {
            XCTAssertNil(value(field, in: body), field)
        }
    }

    func test_F006_AC7_settingTheEmailAndTheLanguageSendsTheValuesAndNoClearFlag() async throws {
        let body = try await sent(.init(email: "anna@example.com", emailLocale: .nlNL))

        XCTAssertEqual(body["email"] as? String, "anna@example.com")
        XCTAssertEqual(body["emailLocale"] as? String, "nl-NL")
        for field in ["name", "clearEmail", "clearEmailLocale"] {
            XCTAssertNil(value(field, in: body), field)
        }
    }
}
