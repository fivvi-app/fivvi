import Foundation
import Network

/// A tiny HTTP server in the UI-test runner that stands in for the API. The app reaches it on the simulator's
/// loopback interface (the Debug build allows plain HTTP), so UI tests can assert what the app requested. It answers
/// the hello route as the test says (`Answer`) and the sign-in routes and `GET /api/v1/me` like the API does for one
/// account (`SignIn`).
final class StubServer: Sendable {
    enum Answer: Sendable {
        /// `200` with this greeting key.
        case greeting(key: String)
        /// An error status without a body.
        case status(Int)
        /// No answer until `answer(with:)` gives one, so the loading state stays on screen.
        case hold
    }

    /// The account the sign-in routes know: its address, the code that works and the token that code is exchanged for.
    struct SignIn: Sendable {
        var email = "owner@example.com"
        var code = "123456"
        var token = "stub-session-token"
    }

    /// A request the app sent: its target, bearer token and JSON body (strings only).
    struct Request: Sendable, Equatable {
        let method: String
        let path: String
        let locale: String?
        let authorization: String?
        let body: [String: String]
    }

    /// The base URL to launch the app with (`-FivviAPIBaseURL`).
    let baseURL: URL
    let signIn: SignIn

    private let listener: NWListener
    private let responder: Responder

    init(_ answer: Answer, signIn: SignIn = SignIn()) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        let listener = try NWListener(using: parameters)
        let responder = Responder(answer, signIn: signIn)
        let queue = DispatchQueue(label: "app.fivvi.uitests.StubServer")
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready, .failed, .cancelled: ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { connection in responder.accept(connection, on: queue) }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 10)
        guard let port = listener.port, let url = URL(string: "http://127.0.0.1:\(port.rawValue)/api") else {
            listener.cancel()
            throw URLError(.cannotFindHost)
        }
        self.listener = listener
        self.responder = responder
        self.signIn = signIn
        baseURL = url
    }

    deinit {
        listener.cancel()
    }

    /// The `locale` query parameter of every `GET /api/v1/hello` so far.
    var requestedLocales: [String?] { responder.requestedLocales }

    /// Every request so far, in order.
    var requests: [Request] { responder.requests }

    /// The requests so far to `path` (e.g. "/api/v1/me").
    func requests(to path: String) -> [Request] { requests.filter { $0.path == path } }

    /// Answers from now on, and answers the requests on hold (unless the new answer is `.hold` too).
    func answer(with answer: Answer) {
        responder.answer(with: answer)
    }
}

/// Reads requests and answers them; shared with Network's callbacks, so its state is behind a lock.
private final class Responder: @unchecked Sendable {
    private let lock = NSLock()
    private let signIn: StubServer.SignIn
    private var currentAnswer: StubServer.Answer
    private var received: [StubServer.Request] = []
    private var held: [(connection: NWConnection, locale: String?)] = []

    init(_ answer: StubServer.Answer, signIn: StubServer.SignIn) {
        currentAnswer = answer
        self.signIn = signIn
    }

    var requests: [StubServer.Request] { lock.withLock { received } }

    var requestedLocales: [String?] {
        lock.withLock { received.filter { $0.path == "/api/v1/hello" }.map(\.locale) }
    }

    func answer(with answer: StubServer.Answer) {
        let waiting: [(connection: NWConnection, locale: String?)] = lock.withLock {
            currentAnswer = answer
            if case .hold = answer { return [] }
            defer { held = [] }
            return held
        }
        waiting.forEach { respond($0.connection, locale: $0.locale, with: answer) }
    }

    func accept(_ connection: NWConnection, on queue: DispatchQueue) {
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    /// Reads until the head and as many body bytes as its `Content-Length` says have arrived.
    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, isComplete, error in
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(bytes: buffer[..<end.lowerBound], encoding: .utf8) ?? ""
                let body = buffer[end.upperBound...]
                if body.count >= Self.contentLength(of: head) {
                    self.handle(connection, head: head, body: Data(body))
                    return
                }
            }
            if isComplete || error != nil {
                connection.cancel()
            } else {
                self.receive(connection, buffer: buffer)
            }
        }
    }

    private static func contentLength(of head: String) -> Int {
        for line in head.split(separator: "\r\n").dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2, parts[0].lowercased() == "content-length" {
                return Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }
        return 0
    }

    private static func header(_ name: String, in head: String) -> String? {
        for line in head.split(separator: "\r\n").dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2, parts[0].lowercased() == name {
                return parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        return nil
    }

    private func handle(_ connection: NWConnection, head: String, body: Data) {
        // Request line: GET /api/v1/hello?locale=en HTTP/1.1
        let line = head.split(separator: "\r\n").first?.split(separator: " ").map(String.init) ?? []
        let method = line.first ?? ""
        let request = line.dropFirst().first.flatMap { URLComponents(string: $0) }
        let path = request?.path ?? ""
        let locale = request?.queryItems?.first { $0.name == "locale" }?.value
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        let authorization = Self.header("authorization", in: head)
        let stringFields = json.compactMapValues { $0 as? String }
        let answer = lock.withLock {
            received.append(.init(
                method: method, path: path, locale: locale, authorization: authorization, body: stringFields
            ))
            if path == "/api/v1/hello", case .hold = currentAnswer { held.append((connection, locale)) }
            return currentAnswer
        }
        switch (method, path) {
        case ("GET", "/api/v1/hello"):
            respond(connection, locale: locale, with: answer)
        case ("POST", "/api/v1/sign-in/request"):
            send(connection, status: 202, json: nil)
        case ("POST", "/api/v1/sign-in/token"):
            let works = stringFields["email"] == signIn.email && stringFields["code"] == signIn.code
            let json = works ? ["token": signIn.token] : ["code": "unauthorized"]
            send(connection, status: works ? 200 : 401, json: json)
        case ("GET", "/api/v1/me"):
            if authorization == "Bearer \(signIn.token)" {
                let account: [String: Any] = [
                    "id": "2f6a1f0e-0000-4000-8000-000000000001", "email": signIn.email, "preferredLocale": NSNull()
                ]
                send(connection, status: 200, json: account)
            } else {
                send(connection, status: 401, json: ["code": "unauthorized"])
            }
        default:
            send(connection, status: 404, json: nil)
        }
    }

    private func respond(_ connection: NWConnection, locale: String?, with answer: StubServer.Answer) {
        switch answer {
        case .hold:
            return
        case let .greeting(key):
            send(connection, status: 200, json: ["greetingKey": key, "locale": locale ?? "en"])
        case let .status(code):
            send(connection, status: code, json: nil)
        }
    }

    private func send(_ connection: NWConnection, status: Int, json: [String: Any]?) {
        let body = json.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data()
        let head = "HTTP/1.1 \(status) Stub\r\nContent-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
}
