import FivviAPI
import HTTPTypes
import OpenAPIRuntime
import XCTest

@testable import FivviPro

/// The auth layer on the real generated `Client`, with a stub transport in place of the network.
final class AuthMiddlewareTests: XCTestCase {
    private let account = """
    {"id":"2f6a1f0e-0000-4000-8000-000000000001","email":"owner@example.com","preferredLocale":null}
    """

    /// A counter the middleware's `onSignedOut` closure can bump.
    private final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        var value: Int { lock.withLock { count } }
        func bump() { lock.withLock { count += 1 } }
    }

    private func client(
        store: InMemorySessionStore, transport: StubTransport, calls: Calls = Calls()
    ) -> Client {
        let middleware = AuthMiddleware(store: store) { calls.bump() }
        return Client(
            serverURL: URL(string: "https://example.com/api")!, transport: transport, middlewares: [middleware]
        )
    }

    func test_F001N_AC4_addsBearerHeader() async throws {
        let transport = StubTransport(status: .ok, json: account)
        let client = client(store: InMemorySessionStore(token: "t-123"), transport: transport)

        let account = try await client.getMe().ok.body.json

        XCTAssertEqual(account.email, "owner@example.com")
        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.path, "/v1/me", "the transport adds the /api mount")
        XCTAssertEqual(request.headerFields[.authorization], "Bearer t-123")
    }

    func test_F001N_AC4_sendsNoHeaderWithoutToken() async throws {
        let transport = StubTransport(status: .ok, json: account)
        let client = client(store: InMemorySessionStore(), transport: transport)

        _ = try await client.getMe()

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertNil(request.headerFields[.authorization])
    }

    func test_F001N_AC9_unauthorizedDeletesTokenAndSignsOut() async throws {
        let store = InMemorySessionStore(token: "expired")
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        let calls = Calls()
        let client = client(store: store, transport: transport, calls: calls)

        let output = try await client.getMe()

        guard case .unauthorized = output else { return XCTFail("the 401 still reaches the caller: \(output)") }
        XCTAssertNil(store.token)
        XCTAssertEqual(calls.value, 1)
    }

    func test_F001N_AC9_unauthorizedWithoutTokenIsNotASignOut() async throws {
        let store = InMemorySessionStore()
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        let calls = Calls()
        let client = client(store: store, transport: transport, calls: calls)

        let output = try await client.exchangeSignInCode(body: .json(.init(email: "owner@example.com", code: "000000")))

        guard case .unauthorized = output else { return XCTFail("a wrong code is a 401: \(output)") }
        XCTAssertEqual(calls.value, 0)
    }

    func test_F001N_AC9_otherErrorsKeepTheToken() async throws {
        let store = InMemorySessionStore(token: "still-good")
        let transport = StubTransport(status: .internalServerError, json: "oops", contentType: "text/plain")
        let calls = Calls()
        let client = client(store: store, transport: transport, calls: calls)

        _ = try await client.getMe()

        XCTAssertEqual(store.token, "still-good")
        XCTAssertEqual(calls.value, 0)
    }

    func test_F001N_AC9_aLateAnswerForAnOldTokenKeepsTheNewSignIn() async throws {
        let store = InMemorySessionStore(token: "old-token")
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        transport.onRequest { try? store.save(token: "new-token") }
        let calls = Calls()
        let client = client(store: store, transport: transport, calls: calls)

        _ = try await client.getMe()

        XCTAssertEqual(store.token, "new-token")
        XCTAssertEqual(calls.value, 0)
    }

    /// A sign-out deletes the stored token before its request goes out; the request carries the token it was given.
    func test_F001N_AC10_sendsTheTokenOfARequestScopedOverrideWhenTheStoreIsEmpty() async throws {
        let transport = StubTransport(status: .noContent)
        let client = client(store: InMemorySessionStore(), transport: transport)

        _ = try await AuthMiddleware.$requestToken.withValue("snapshot") { try await client.signOut() }

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.headerFields[.authorization], "Bearer snapshot")
        let next = StubTransport(status: .ok, json: account)
        _ = try await self.client(store: InMemorySessionStore(), transport: next).getMe()
        XCTAssertNil(try XCTUnwrap(next.requests.first).headerFields[.authorization], "the override is scoped")
    }

    /// The 401 of a request with its own token is its caller's to handle: the store holds a newer sign-in or none.
    func test_F001N_AC10_aRefusedOverrideTokenIsLeftToTheCaller() async throws {
        let store = InMemorySessionStore(token: "new-sign-in")
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        let calls = Calls()
        let client = client(store: store, transport: transport, calls: calls)

        _ = try await AuthMiddleware.$requestToken.withValue("snapshot") { try await client.signOut() }

        XCTAssertEqual(store.token, "new-sign-in")
        XCTAssertEqual(calls.value, 0)
    }
}
