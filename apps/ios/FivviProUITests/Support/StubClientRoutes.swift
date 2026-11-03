import Foundation

/// The client routes of the stub server (F006): `GET` and `POST /api/v1/workspaces/{id}/clients`, `GET` and `PATCH` one
/// client. It starts with the three clients of John's Gym (synthetic) and follows the API's rules that the screens
/// depend on: sorted by name, search by part of a name or an email address without regard to case, one client per email
/// address (`409` with the existing client's ID), a missing or blank address refused (`400` on `email`: it is required and
/// never cleared) and the edit body's "keep" and "clear" fields.
final class StubClientRoutes: @unchecked Sendable {
    private let lock = NSLock()
    private var clients: [[String: Any]]
    private var nextNumber = 4

    /// `empty`: a workspace without clients, for the empty state.
    init(empty: Bool = false) {
        clients = empty ? [] : [
            StubClientRoutes.client(1, "Anna de Vries", "anna@example.com", "en"),
            StubClientRoutes.client(2, "Mark Jansen", "mark@example.com", nil),
            StubClientRoutes.client(3, "Sophie Bakker", "sophie.bakker@example.com", nil)
        ]
    }

    private static func client(_ number: Int, _ name: String, _ email: String, _ locale: String?) -> [String: Any] {
        [
            "id": String(format: "3f0b1c2e-8a54-4b51-9a42-%012d", number), "name": name,
            "email": email, "emailLocale": locale.map { $0 as Any } ?? NSNull()
        ]
    }

    /// The answer to a client route as `(status, JSON)`, or nil when `path` is no client route.
    func respond(
        method: String, path: String, query: [String: String], body: [String: Any]
    ) -> (status: Int, json: [String: Any])? {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.count >= 5, parts[0] == "api", parts[1] == "v1", parts[2] == "workspaces", parts[4] == "clients"
        else { return nil }
        return lock.withLock {
            switch (method, parts.count) {
            case ("GET", 5): list(query)
            case ("POST", 5): add(body)
            case ("GET", 6): find(parts[5]).map { (200, $0) } ?? (404, ["code": "not_found"])
            case ("PATCH", 6): update(parts[5], body)
            default: (404, ["code": "not_found"])
            }
        }
    }

    private func fold(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    /// What a search looks at: the name and the email address.
    private func searchable(_ client: [String: Any]) -> String {
        "\(client["name"] as? String ?? "") \(client["email"] as? String ?? "")"
    }

    private func find(_ id: String) -> [String: Any]? { clients.first { $0["id"] as? String == id } }

    private func list(_ query: [String: String]) -> (Int, [String: Any]) {
        let needle = fold(query["search"] ?? "")
        let matching = clients
            .filter { needle.isEmpty || fold(searchable($0)).contains(needle) }
            .sorted { fold($0["name"] as? String ?? "") < fold($1["name"] as? String ?? "") }
        let size = Int(query["pageSize"] ?? "") ?? 50
        let start = min(((Int(query["page"] ?? "") ?? 1) - 1) * size, matching.count)
        return (200, ["items": Array(matching[start ..< min(start + size, matching.count)]), "total": matching.count])
    }

    private func add(_ body: [String: Any]) -> (Int, [String: Any]) {
        let name = (body["name"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, name.count <= 120 else { return invalid("name") }
        let email = (body["email"] as? String ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        guard !email.isEmpty else { return invalid("email") }
        if let existing = clients.first(where: { $0["email"] as? String == email }) {
            return (409, ["code": "client_exists", "clientId": existing["id"] as Any])
        }
        let client = StubClientRoutes.client(nextNumber, name, email, body["emailLocale"] as? String)
        nextNumber += 1
        clients.append(client)
        return (201, client)
    }

    private func update(_ id: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        guard var client = find(id) else { return (404, ["code": "not_found"]) }
        if let name = body["name"] as? String { client["name"] = name }
        if let email = (body["email"] as? String)?.trimmingCharacters(in: .whitespaces).lowercased() {
            guard !email.isEmpty else { return invalid("email") }
            if let other = clients.first(where: { $0["email"] as? String == email && $0["id"] as? String != id }) {
                return (409, ["code": "client_exists", "clientId": other["id"] as Any])
            }
            client["email"] = email
        }
        if body["clearEmailLocale"] as? Bool == true {
            client["emailLocale"] = NSNull()
        } else if let locale = body["emailLocale"] as? String {
            client["emailLocale"] = locale
        }
        clients = clients.map { $0["id"] as? String == id ? client : $0 }
        return (200, client)
    }

    private func invalid(_ field: String) -> (Int, [String: Any]) {
        (400, ["code": "validation_failed", "issues": [["path": field, "code": "invalid"]]])
    }
}
