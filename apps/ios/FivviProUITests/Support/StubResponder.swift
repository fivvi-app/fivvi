import Foundation
import Network

/// Reads requests and answers them; shared with Network's callbacks, so its state is behind a lock.
final class Responder: @unchecked Sendable {
    let lock = NSLock()
    let signIn: StubServer.SignIn
    let clientRoutes: StubClientRoutes
    let sessionRoutes: StubSessionRoutes
    let personalRoutes = StubPersonalRoutes()
    var received: [StubServer.Request] = []
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
    var heldClientReads: [@Sendable () -> Void] = []
    var holdsAccountReads = false
    var heldAccountReads: [@Sendable () -> Void] = []

    init(signIn: StubServer.SignIn) {
        self.signIn = signIn
        clientRoutes = StubClientRoutes(empty: signIn.hasNoClients)
        sessionRoutes = StubSessionRoutes(signIn: signIn, clients: clientRoutes)
        personalRoutes.isCancelled = { [sessionRoutes] in sessionRoutes.isCancelled($0) }
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
        let waiting: [@Sendable () -> Void] = lock.withLock {
            holdsClientReads = hold
            defer { if !hold { heldClientReads = [] } }
            return hold ? [] : heldClientReads
        }
        waiting.forEach { $0() }
    }

    /// While true, `GET /api/v1/me` gets no answer until it is set to false (which answers the reads held).
    func holdAccountReads(_ hold: Bool) {
        let waiting: [@Sendable () -> Void] = lock.withLock {
            holdsAccountReads = hold
            defer { if !hold { heldAccountReads = [] } }
            return hold ? [] : heldAccountReads
        }
        waiting.forEach { $0() }
    }

    /// Keeps `answer` for later when the account reads are on hold; returns whether it did.
    func holdAccountRead(_ answer: @escaping @Sendable () -> Void) -> Bool {
        lock.withLock {
            if holdsAccountReads { heldAccountReads.append(answer) }
            return holdsAccountReads
        }
    }

    /// Keeps `answer` for later when it is the read of one client and reads are on hold; returns whether it did.
    func holdClientRead(method: String, path: String, answer: @escaping @Sendable () -> Void) -> Bool {
        let isRead = method == "GET" && path.split(separator: "/").count == 6 && path.contains("/clients/")
        return lock.withLock {
            let holds = holdsClientReads && isRead
            if holds { heldClientReads.append(answer) }
            return holds
        }
    }

    var requests: [StubServer.Request] { lock.withLock { received } }

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
        // Request line: GET /api/v1/me HTTP/1.1
        let line = head.split(separator: "\r\n").first?.split(separator: " ").map(String.init) ?? []
        let method = line.first ?? ""
        let request = line.dropFirst().first.flatMap { URLComponents(string: $0) }
        let path = request?.path ?? ""
        let query = Dictionary(request?.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { $1 })
        let locale = query["locale"]
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        let authorization = Self.header("authorization", in: head)
        let stringFields = json.compactMapValues { $0 as? String }
        let (isOffline, holdsSignInRequest) = lock.withLock {
            received.append(.init(
                method: method, path: path, locale: locale, authorization: authorization, body: stringFields
            ))
            let holdsSignInRequest = path == "/api/v1/sign-in/request" && holdsSignIn
            if holdsSignInRequest { heldSignIn.append(connection) }
            return (offline, holdsSignInRequest)
        }
        if isOffline {
            connection.cancel()
            return
        }
        if holdsSignInRequest { return }
        switch (method, path) {
        case ("POST", "/api/v1/sign-in/request"):
            send(connection, status: 202, json: nil)
        case ("POST", "/api/v1/sign-in/token"):
            let works = stringFields["email"] == signIn.email && stringFields["code"] == signIn.code
            send(connection, status: works ? 200 : 401, json: works ? ["token": signIn.token] : Self.unauthorized)
        case ("POST", "/api/v1/sign-out"):
            let works = authorization == "Bearer \(signIn.token)"
            send(connection, status: works ? 204 : 401, json: works ? nil : Self.unauthorized)
        case ("GET", _) where Self.isDayRoute(path):
            respondToDay(connection, path: path, query: query, authorization: authorization)
        case (_, _) where Self.isAccountRoute(method: method, path: path):
            respondToAccountRoute(
                connection, method: method, path: path, authorization: authorization, fields: stringFields
            )
        default:
            let reply = StubSessionRoutes.isSessionRoute(path)
                ? sessionReply(method: method, path: path, body: json, authorization: authorization)
                : clientReply(method: method, path: path, query: query, body: json, authorization: authorization)
            answerClientRoute(connection, method: method, path: path, reply: reply)
        }
    }

    /// The day routes: the person's own (`GET /api/v1/me/day`, F013), their range of days
    /// (`GET /api/v1/me/sessions`, F013) and a workspace's (`GET /api/v1/workspaces/{id}/day`, F014).
    static func isDayRoute(_ path: String) -> Bool {
        path == "/api/v1/me/day" || path == "/api/v1/me/sessions"
            || path.hasPrefix("/api/v1/workspaces/") && path.hasSuffix("/day")
    }

    func respondToDay(_ connection: NWConnection, path: String, query: [String: String], authorization: String?) {
        let reply: (Int, [String: Any])
        let date = query["date"] ?? ""
        if authorization != "Bearer \(signIn.token)" {
            reply = (401, Self.notSignedIn)
        } else if path == "/api/v1/me/day" {
            reply = personalRoutes.respond(date: date)
        } else if path == "/api/v1/me/sessions" {
            reply = personalRoutes.respondSessions(from: query["from"] ?? "", through: query["to"] ?? "")
        } else {
            reply = personalRoutes.respondWorkspaceDay(date: date, ownName: signIn.name ?? "Owner")
        }
        send(connection, status: reply.0, json: reply.1)
    }

    /// Answers a client route, unless reads of one client are on hold: then when they are released.
    func answerClientRoute(
        _ connection: NWConnection, method: String, path: String, reply: (status: Int, json: [String: Any]?)
    ) {
        nonisolated(unsafe) let json = reply.json  // read once, by the one closure that answers
        let status = reply.status
        let answer: @Sendable () -> Void = { [self] in send(connection, status: status, json: json) }
        if !holdClientRead(method: method, path: path, answer: answer) { answer() }
    }

    /// The session routes (F020) for a signed-in caller; any other path is unknown.
    func sessionReply(
        method: String, path: String, body: [String: Any], authorization: String?
    ) -> (status: Int, json: [String: Any]?) {
        guard authorization == "Bearer \(signIn.token)" else { return (401, Self.notSignedIn) }
        return sessionRoutes.respond(method: method, path: path, body: body) ?? (404, nil)
    }

    /// The client routes (F006) for a signed-in caller; any other path is unknown.
    func clientReply(
        method: String, path: String, query: [String: String], body: [String: Any], authorization: String?
    ) -> (status: Int, json: [String: Any]?) {
        guard authorization == "Bearer \(signIn.token)" else { return (path.contains("/clients") ? 401 : 404, nil) }
        return clientRoutes.respond(method: method, path: path, query: query, body: body) ?? (404, nil)
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
