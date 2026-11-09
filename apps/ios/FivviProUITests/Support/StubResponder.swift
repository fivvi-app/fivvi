import Foundation
import Network

/// Reads requests and answers them; shared with Network's callbacks, so its state is behind a lock.
final class Responder: @unchecked Sendable {
    let lock = NSLock()
    let signIn: StubServer.SignIn
    let clientRoutes: StubClientRoutes
    var currentAnswer: StubServer.Answer
    var received: [StubServer.Request] = []
    var held: [(connection: NWConnection, locale: String?)] = []
    var offline = false
    var lost: Set<Int> = []
    var storedLocale: String?
    var holdsSignIn = false
    var heldSignIn: [NWConnection] = []
    var storedName: String?
    var trains: [Int: Bool] = [:]
    var holdsTrainerCalls = false
    var heldTrainerCalls: [@Sendable () -> Void] = []
    var storedTrainerStatus: Int?
    var holdsClientReads = false
    var heldClientReads: [() -> Void] = []

    init(_ answer: StubServer.Answer, signIn: StubServer.SignIn) {
        currentAnswer = answer
        self.signIn = signIn
        clientRoutes = StubClientRoutes(empty: signIn.hasNoClients)
        storedLocale = signIn.preferredLocale
        storedName = signIn.name
    }

    var preferredLocale: String? {
        get { lock.withLock { storedLocale } }
        set { lock.withLock { storedLocale = newValue } }
    }

    /// The name stored on the account (F005), as `PATCH /api/v1/me` from the app or a change on the web leaves it.
    var name: String? {
        get { lock.withLock { storedName } }
        set { lock.withLock { storedName = newValue } }
    }

    /// An error status every trainer-profile call is answered with (instead of the change), or nil for none.
    var trainerStatus: Int? {
        get { lock.withLock { storedTrainerStatus } }
        set { lock.withLock { storedTrainerStatus = newValue } }
    }

    /// Whether the Owner's switch of the workspace numbered `index` is on, once a call has changed it.
    func trainsOverride(at index: Int) -> Bool? { lock.withLock { trains[index] } }

    func setTrains(_ trains: Bool, at index: Int) {
        lock.withLock { self.trains[index] = trains }
    }

    /// While true, trainer-profile calls get no answer until it is set to false (which answers the calls held).
    func holdTrainerProfileRequests(_ hold: Bool) {
        let waiting: [@Sendable () -> Void] = lock.withLock {
            holdsTrainerCalls = hold
            defer { if !hold { heldTrainerCalls = [] } }
            return hold ? [] : heldTrainerCalls
        }
        waiting.forEach { $0() }
    }

    /// Keeps `answer` for later when the calls are on hold; returns whether it did.
    func holdTrainerCall(_ answer: @escaping @Sendable () -> Void) -> Bool {
        lock.withLock {
            if holdsTrainerCalls { heldTrainerCalls.append(answer) }
            return holdsTrainerCalls
        }
    }

    /// While true, `GET` of one client gets no answer until it is set to false (which answers the reads held).
    func holdClientReads(_ hold: Bool) {
        let waiting: [() -> Void] = lock.withLock {
            holdsClientReads = hold
            defer { if !hold { heldClientReads = [] } }
            return hold ? [] : heldClientReads
        }
        waiting.forEach { $0() }
    }

    /// Keeps `answer` for later when it is the read of one client and reads are on hold; returns whether it did.
    func holdClientRead(method: String, path: String, answer: @escaping () -> Void) -> Bool {
        let isRead = method == "GET" && path.split(separator: "/").count == 6 && path.contains("/clients/")
        return lock.withLock {
            let holds = holdsClientReads && isRead
            if holds { heldClientReads.append(answer) }
            return holds
        }
    }

    var requests: [StubServer.Request] { lock.withLock { received } }

    var requestedLocales: [String?] {
        lock.withLock { received.filter { $0.path == "/api/v1/hello" }.map(\.locale) }
    }

    func setOffline(_ value: Bool) {
        lock.withLock { offline = value }
    }

    func removeFromTeam(workspace index: Int) {
        lock.withLock { _ = lost.insert(index) }
    }

    func holdSignInRequests(_ hold: Bool) {
        let waiting: [NWConnection] = lock.withLock {
            holdsSignIn = hold
            defer { if !hold { heldSignIn = [] } }
            return hold ? [] : heldSignIn
        }
        waiting.forEach { send($0, status: 202, json: nil) }
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
    func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, isComplete, error in
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(bytes: buffer[..<end.lowerBound], encoding: .utf8) ?? ""
                let body = buffer[end.upperBound...]
                if body.count >= (Int(Self.header("content-length", in: head) ?? "") ?? 0) {
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

    static func header(_ name: String, in head: String) -> String? {
        for line in head.split(separator: "\r\n").dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2, parts[0].lowercased() == name {
                return parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        return nil
    }

    func handle(_ connection: NWConnection, head: String, body: Data) {
        // Request line: GET /api/v1/hello?locale=en HTTP/1.1
        let line = head.split(separator: "\r\n").first?.split(separator: " ").map(String.init) ?? []
        let method = line.first ?? ""
        let request = line.dropFirst().first.flatMap { URLComponents(string: $0) }
        let path = request?.path ?? ""
        let query = Dictionary(request?.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { $1 })
        let locale = query["locale"]
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        let authorization = Self.header("authorization", in: head)
        let stringFields = json.compactMapValues { $0 as? String }
        let (answer, isOffline, holdsSignInRequest) = lock.withLock {
            received.append(.init(
                method: method, path: path, locale: locale, authorization: authorization, body: stringFields
            ))
            if path == "/api/v1/hello", case .hold = currentAnswer { held.append((connection, locale)) }
            let holdsSignInRequest = path == "/api/v1/sign-in/request" && holdsSignIn
            if holdsSignInRequest { heldSignIn.append(connection) }
            return (currentAnswer, offline, holdsSignInRequest)
        }
        if isOffline {
            connection.cancel()
            return
        }
        if holdsSignInRequest { return }
        switch (method, path) {
        case ("GET", "/api/v1/hello"):
            respond(connection, locale: locale, with: answer)
        case ("POST", "/api/v1/sign-in/request"):
            send(connection, status: 202, json: nil)
        case ("POST", "/api/v1/sign-in/token"):
            let works = stringFields["email"] == signIn.email && stringFields["code"] == signIn.code
            send(connection, status: works ? 200 : 401, json: works ? ["token": signIn.token] : Self.unauthorized)
        case ("POST", "/api/v1/sign-out"):
            let works = authorization == "Bearer \(signIn.token)"
            send(connection, status: works ? 204 : 401, json: works ? nil : Self.unauthorized)
        case (_, _) where Self.isAccountRoute(method: method, path: path):
            respondToAccountRoute(
                connection, method: method, path: path, authorization: authorization, fields: stringFields
            )
        default:
            let reply = clientReply(method: method, path: path, query: query, body: json, authorization: authorization)
            answerClientRoute(connection, method: method, path: path, reply: reply)
        }
    }

    /// Answers a client route, unless reads of one client are on hold: then when they are released.
    func answerClientRoute(
        _ connection: NWConnection, method: String, path: String, reply: (status: Int, json: [String: Any]?)
    ) {
        let answer = { self.send(connection, status: reply.status, json: reply.json) }
        if !holdClientRead(method: method, path: path, answer: answer) { answer() }
    }

    /// The client routes (F006) for a signed-in caller; any other path is unknown.
    func clientReply(
        method: String, path: String, query: [String: String], body: [String: Any], authorization: String?
    ) -> (status: Int, json: [String: Any]?) {
        guard authorization == "Bearer \(signIn.token)" else { return (path.contains("/clients") ? 401 : 404, nil) }
        return clientRoutes.respond(method: method, path: path, query: query, body: body) ?? (404, nil)
    }

    func respond(_ connection: NWConnection, locale: String?, with answer: StubServer.Answer) {
        switch answer {
        case .hold:
            return
        case let .greeting(key):
            send(connection, status: 200, json: ["greetingKey": key, "locale": locale ?? "en"])
        case let .status(code):
            send(connection, status: code, json: nil)
        }
    }

    func send(_ connection: NWConnection, status: Int, json: [String: Any]?) {
        // A list is sent as a JSON array: `["_": list]` stands for the list itself.
        let value: Any? = json.flatMap { $0.count == 1 ? $0["_"] : nil } ?? json
        let body = value.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data()
        let head = "HTTP/1.1 \(status) Stub\r\nContent-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
}
