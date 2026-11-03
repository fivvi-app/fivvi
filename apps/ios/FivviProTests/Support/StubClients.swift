import Foundation
import FivviAPI

/// The clients of the stub workspace and what the client routes answer (F006), behind a lock: `StubAPI` is an actor
/// and calls it from its routes. It follows the API's rules where a test depends on them: sorted by name, search by part
/// of a name or an email address without regard to case and accents, pages, an email address lower case, one client per
/// address (`409` with the existing client), a missing or blank address refused (`400` on `email`: it is required, never
/// cleared) and the edit body's "keep" and "clear" fields.
final class StubClients: @unchecked Sendable {
    typealias Client = Components.Schemas.Client

    /// What a route answers instead of working.
    enum Failure: Sendable, Equatable {
        case offline
        case status(Int)
        case forbidden
        case notFound
        /// `400` with these invalid field paths.
        case badRequest([String])
    }

    enum Route: Sendable {
        case list, add, get, update
    }

    /// One `PATCH` the app sent.
    struct Update: Sendable, Equatable {
        let clientID: String
        let body: Components.Schemas.UpdateClientRequest
    }

    private let lock = NSLock()
    private var stored: [Client] = []
    private var failures: [Route: Failure] = [:]
    private var defaultLocale = Components.Schemas.Locale.nlNL
    private var timeZone = "Europe/Amsterdam"
    private var nextNumber = 1
    private var searchesSent: [String?] = []
    private var pagesSent: [Int] = []
    private var addsSent: [Components.Schemas.AddClientRequest] = []
    private var updatesSent: [Update] = []
    private var getsSent: [String] = []

    /// The workspace's default communication language, as `GET /workspaces/{id}` answers it.
    var workspaceDefaultLocale: Components.Schemas.Locale {
        get { lock.withLock { defaultLocale } }
        set { lock.withLock { defaultLocale = newValue } }
    }

    /// The workspace's IANA time zone, as `GET /workspaces/{id}` answers it.
    var workspaceTimeZone: String {
        get { lock.withLock { timeZone } }
        set { lock.withLock { timeZone = newValue } }
    }

    /// The clients now, in the order they were added.
    var all: [Client] { lock.withLock { stored } }
    /// The `search` of every list request, in order.
    var searches: [String?] { lock.withLock { searchesSent } }
    /// The `page` of every list request, in order.
    var pages: [Int] { lock.withLock { pagesSent } }
    var adds: [Components.Schemas.AddClientRequest] { lock.withLock { addsSent } }
    var updates: [Update] { lock.withLock { updatesSent } }
    /// The IDs `getClient` was asked for, in order.
    var gets: [String] { lock.withLock { getsSent } }

    /// Puts clients in the workspace, as they would be there already.
    func seed(_ clients: [Seed]) {
        lock.withLock {
            for client in clients {
                stored.append(makeClient(name: client.name, email: client.email, locale: client.locale))
            }
        }
    }

    /// A client to put in the workspace.
    struct Seed {
        let name: String
        let email: String
        let locale: Components.Schemas.Locale?

        init(_ name: String, _ email: String, _ locale: Components.Schemas.Locale? = nil) {
            self.name = name
            self.email = email
            self.locale = locale
        }
    }

    /// The ID of a stub client by its position in `all`, so tests name no UUID.
    func id(of name: String) -> String? { all.first { $0.name == name }?.id }

    func fail(_ route: Route, with failure: Failure?) {
        lock.withLock { failures[route] = failure }
    }

    // MARK: Routes

    func list(search: String?, page: Int, pageSize: Int) throws -> Operations.ListClients.Output {
        try lock.withLock {
            searchesSent.append(search)
            pagesSent.append(page)
            if let output: Operations.ListClients.Output = try failure(.list) { return output }
            let needle = Self.fold(search ?? "")
            let matching = stored
                .filter { needle.isEmpty || Self.fold($0.name + " " + $0.email).contains(needle) }
                .sorted { Self.fold($0.name) < Self.fold($1.name) }
            let start = min((page - 1) * pageSize, matching.count)
            let items = Array(matching[start ..< min(start + pageSize, matching.count)])
            return .ok(.init(body: .json(.init(items: items, total: matching.count))))
        }
    }

    func add(_ body: Components.Schemas.AddClientRequest) throws -> Operations.AddClient.Output {
        try lock.withLock {
            addsSent.append(body)
            if let output: Operations.AddClient.Output = try failure(.add) { return output }
            let email = body.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if email.isEmpty { return .badRequest(.init(body: .json(issues(["email"])))) }
            if let existing = stored.first(where: { $0.email == email }) {
                return .conflict(.init(body: .json(.init(code: .clientExists, clientId: existing.id))))
            }
            let client = makeClient(
                name: body.name, email: email, locale: body.emailLocale.flatMap { .init(rawValue: $0.rawValue) }
            )
            stored.append(client)
            return .created(.init(body: .json(client)))
        }
    }

    func get(_ id: String) throws -> Operations.GetClient.Output {
        try lock.withLock {
            getsSent.append(id)
            if let output: Operations.GetClient.Output = try failure(.get) { return output }
            guard let client = stored.first(where: { $0.id == id }) else { return notFoundGet() }
            return .ok(.init(body: .json(client)))
        }
    }

    func update(_ id: String, _ body: Components.Schemas.UpdateClientRequest) throws -> Operations.UpdateClient.Output {
        try lock.withLock {
            updatesSent.append(.init(clientID: id, body: body))
            if let output: Operations.UpdateClient.Output = try failure(.update) { return output }
            guard let index = stored.firstIndex(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            var client = stored[index]
            if let name = body.name { client.name = name }
            if let email = body.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
                if email.isEmpty { return .badRequest(.init(body: .json(issues(["email"])))) }
                if let other = stored.first(where: { $0.email == email && $0.id != id }) {
                    return .conflict(.init(body: .json(.init(code: .clientExists, clientId: other.id))))
                }
                client.email = email
            }
            if body.clearEmailLocale == true {
                client.emailLocale = nil
            } else if let locale = body.emailLocale, locale != ._empty_ {
                client.emailLocale = .init(rawValue: locale.rawValue)
            }
            stored[index] = client
            return .ok(.init(body: .json(client)))
        }
    }

    // MARK: Helpers

    private func makeClient(name: String, email: String, locale: Components.Schemas.Locale?) -> Client {
        defer { nextNumber += 1 }
        return .init(
            id: String(format: "3f0b1c2e-8a54-4b51-9a42-%012d", nextNumber), name: name, email: email.lowercased(),
            emailLocale: locale.flatMap { .init(rawValue: $0.rawValue) }
        )
    }

    /// The failure set for `route`, as the output of its route; `offline` throws. Generic over the route's output.
    private func failure<Output: StubClientsOutput>(_ route: Route) throws -> Output? {
        guard let failure = failures[route] else { return nil }
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case let .status(code): return Output.undocumented(code)
        case .forbidden: return Output.forbidden()
        case .notFound: return Output.notFound()
        case let .badRequest(paths): return Output.badRequest(paths)
        }
    }

    private func notFoundGet() -> Operations.GetClient.Output {
        .notFound(.init(body: .json(.init(code: .notFound))))
    }

    /// Lower case without accents: what the API's search ignores.
    static func fold(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }
}

/// The failure outputs every client route has, so `StubClients.failure` is written once.
protocol StubClientsOutput {
    static func undocumented(_ status: Int) -> Self
    static func forbidden() -> Self
    static func notFound() -> Self
    static func badRequest(_ paths: [String]) -> Self
}

private func issues(_ paths: [String]) -> Components.Schemas.ValidationError {
    .init(code: .validationFailed, issues: paths.map { .init(path: $0, code: "invalid") })
}

extension Operations.ListClients.Output: StubClientsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ paths: [String]) -> Self { .badRequest(.init(body: .json(issues(paths)))) }
}

extension Operations.AddClient.Output: StubClientsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ paths: [String]) -> Self { .badRequest(.init(body: .json(issues(paths)))) }
}

extension Operations.GetClient.Output: StubClientsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ paths: [String]) -> Self { .badRequest(.init(body: .json(issues(paths)))) }
}

extension Operations.UpdateClient.Output: StubClientsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ paths: [String]) -> Self { .badRequest(.init(body: .json(issues(paths)))) }
}
