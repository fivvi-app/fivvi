import FivviAPI
import FivviSession
import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Synthetic accounts (AGENTS.md, D8) and a client that answers from them: the real generated `Client` over a stub
/// transport, so the tests drive the same code path as the app, and a new API operation never has to be stubbed here.
enum Accounts {
    static let id = "2f6a1f0e-0000-4000-8000-000000000001"
    static let token = "stub-session-token"

    /// Anna de Vries: Dutch, an account with no workspace (spec #469).
    static func anna(preferredLocale: String? = "nl-NL") -> String {
        me(email: "anna@example.com", name: "Anna de Vries", preferredLocale: preferredLocale, workspaces: [])
    }

    /// Sarah, a Trainer of John's Gym with no client relationship (spec #469).
    static func sarah() -> String {
        me(email: "trainer@example.com", name: "Sarah", preferredLocale: nil, workspaces: [
            ["id": "7c1d2e3f-0000-4000-8000-000000000000", "name": "John's Gym", "slug": "johns-gym",
             "trainerWord": "trainer", "role": "trainer", "capabilities": ["clients.view"]]
        ])
    }

    /// The JSON of `GET /api/v1/me`.
    static func me(email: String, name: String?, preferredLocale: String?, workspaces: [[String: Any]]) -> String {
        let account: [String: Any] = [
            "id": id, "email": email, "name": name.map { $0 as Any } ?? NSNull(),
            "preferredLocale": preferredLocale.map { $0 as Any } ?? NSNull(), "bookingEmails": true,
            "canCreateWorkspace": false, "workspaces": workspaces, "clientWorkspaces": [Any]()
        ]
        // swiftlint:disable:next force_try
        return String(decoding: try! JSONSerialization.data(withJSONObject: account), as: UTF8.self)
    }

    /// A client whose every answer is `transport`'s, with the bearer token of `store` added as in the app.
    static func client(_ transport: any ClientTransport, store: any SessionStore) -> Client {
        Client(
            serverURL: URL(string: "https://api.example.com/api")!, transport: transport,
            middlewares: [AuthMiddleware(store: store) {}]
        )
    }
}

/// A transport that never answers, as a connection that hangs: the request ends only when its task is cancelled.
struct HangingTransport: ClientTransport {
    func send(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        try await Task.sleep(for: .seconds(600))
        return (HTTPResponse(status: .ok), nil)
    }
}
