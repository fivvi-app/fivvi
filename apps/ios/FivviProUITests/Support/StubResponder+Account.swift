import Foundation
import Network

/// The account routes of the stub API: `GET` / `PATCH /api/v1/me`, `GET /api/v1/me/workspaces`, `GET /api/v1/workspaces/{id}`
/// and the trainer profile (`PUT` / `DELETE /api/v1/workspaces/{id}/trainer-profile`, F005).
extension Responder {
    static var unauthorized: [String: Any] { ["code": "unauthorized"] }
    static var notSignedIn: [String: Any] { ["code": "not_signed_in"] }

    /// The account's workspaces in the order of the list, with the number each one has (0 for the first); the ones it
    /// lost its team access to are not in it.
    var teamWorkspaceEntries: [(index: Int, workspace: StubServer.Workspace)] {
        let lostNumbers: Set<Int> = lock.withLock { self.lost }
        var all: [StubServer.Workspace] = []
        if let name = signIn.workspaceName { all.append(StubServer.Workspace(name: name, role: signIn.role)) }
        all.append(contentsOf: signIn.otherWorkspaces)
        var entries: [(index: Int, workspace: StubServer.Workspace)] = []
        for (number, workspace) in all.enumerated() where !lostNumbers.contains(number) {
            entries.append((index: number, workspace: workspace))
        }
        return entries
    }

    static func workspaceID(_ index: Int) -> String { "7c1d2e3f-0000-4000-8000-00000000000\(index)" }

    /// `GET /api/v1/me/workspaces`: the list.
    var teamWorkspaces: [[String: Any]] {
        teamWorkspaceEntries.map {
            [
                "workspaceId": Self.workspaceID($0.index), "name": $0.workspace.name, "slug": "workspace-\($0.index)",
                "trainerWord": "trainer",
                "role": $0.workspace.role, "capabilities": capabilities(ofWorkspace: $0.index, role: $0.workspace.role),
                // F005: a Trainer always trains; an Owner trains once the switch was put on
                "trainsHere": trainsOverride(at: $0.index) ?? ($0.workspace.role != "owner")
            ]
        }
    }

    /// The first workspace's capabilities may be set by the test; any other follows the matrix.
    func capabilities(ofWorkspace index: Int, role: String) -> [String] {
        (index == 0 ? signIn.capabilities : nil) ?? Self.capabilities(ofRole: role)
    }

    /// The permission matrix of `packages/domain` (F004): what a role may do, as the API sends it.
    static func capabilities(ofRole role: String) -> [String] {
        role == "owner"
            ? ["workspace.manage", "team.view", "team.manage", "trainers.view", "clients.view", "clients.manage",
               "location.read", "settings.manage", "team.invite", "session.private.manage.own",
               "session.private.manage.any", "class.manage", "class.read", "join_link.view", "join_link.renew"]
            : ["trainers.view", "clients.view", "clients.manage", "location.read", "session.private.manage.own",
               "class.read", "join_link.view"]
    }

    /// `GET /api/v1/me`'s answer for the one account.
    var account: [String: Any] {
        [
            "id": "2f6a1f0e-0000-4000-8000-000000000001", "email": signIn.email,
            "name": name.map { $0 as Any } ?? NSNull(),
            "preferredLocale": preferredLocale.map { $0 as Any } ?? NSNull(),
            "bookingEmails": true,
            "canCreateWorkspace": signIn.canCreateWorkspace,
            "workspaces": teamWorkspaces.map { entry in
                ["id": entry["workspaceId"] as Any, "name": entry["name"] as Any, "slug": entry["slug"] as Any,
                 "trainerWord": entry["trainerWord"] as Any, "role": entry["role"] as Any,
                 "capabilities": entry["capabilities"] as Any]
            },
            "clientWorkspaces": [Any]()
        ]
    }

    static func isAccountRoute(method: String, path: String) -> Bool {
        if method == "PATCH" { return path == "/api/v1/me" }
        if method == "PUT" || method == "DELETE" { return isTrainerProfile(path) }
        return method == "GET"
            && (path == "/api/v1/me" || path == "/api/v1/me/workspaces" || isWorkspaceRoute(path))
    }

    static func isWorkspaceRoute(_ path: String) -> Bool {
        path.hasPrefix("/api/v1/workspaces/") && !path.contains("/clients")
    }

    /// `GET /api/v1/me`, `PATCH /api/v1/me`, `GET /api/v1/me/workspaces`, `GET /api/v1/workspaces/{id}` and the trainer
    /// profile; `fields` are the string fields of the request's JSON body.
    func respondToAccountRoute(
        _ connection: NWConnection, method: String, path: String, authorization: String?, fields: [String: String]
    ) {
        if method == "PATCH" {
            updateMe(connection, authorization: authorization, fields: fields)
            return
        }
        if Self.isTrainerProfile(path) {
            respondToTrainerProfile(connection, method: method, path: path, authorization: authorization)
            return
        }
        if path == "/api/v1/me" {
            respondToMe(connection, authorization: authorization)
            return
        }
        guard authorization == "Bearer \(signIn.token)" else {
            send(connection, status: 401, json: Self.notSignedIn)
            return
        }
        if path == "/api/v1/me/workspaces" {
            send(connection, status: 200, json: ["_": teamWorkspaces])
        } else {
            respondToWorkspace(connection, id: String(path.dropFirst("/api/v1/workspaces/".count)))
        }
    }

    /// `GET /api/v1/workspaces/{id}`: the workspace for a team member, `404` for anyone else.
    func respondToWorkspace(_ connection: NWConnection, id: String) {
        guard let entry = teamWorkspaceEntries.first(where: { Self.workspaceID($0.index) == id }) else {
            send(connection, status: 404, json: ["code": "not_found"])
            return
        }
        send(connection, status: 200, json: [
            "id": id, "name": entry.workspace.name, "slug": "workspace-\(entry.index)", "defaultLocale": "nl-NL",
            "timeZone": "Europe/Amsterdam", "trainerWord": "trainer"
        ])
    }

    /// `PATCH /api/v1/me`: stores the language and the name and answers with the account, as the API does. A name is
    /// trimmed, at least one and at most 80 characters (`too_small`, `too_big` on `name`).
    func updateMe(_ connection: NWConnection, authorization: String?, fields: [String: String]) {
        guard authorization == "Bearer \(signIn.token)" else {
            send(connection, status: 401, json: Self.notSignedIn)
            return
        }
        var issues: [[String: String]] = []
        let locale = fields["preferredLocale"]
        if let locale, !["nl-NL", "en"].contains(locale) {
            issues.append(["path": "preferredLocale", "code": "invalid_value"])
        }
        let given = fields["name"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let given, given.isEmpty { issues.append(["path": "name", "code": "too_small"]) }
        if let given, given.count > 80 { issues.append(["path": "name", "code": "too_big"]) }
        guard issues.isEmpty, locale != nil || given != nil else {
            send(connection, status: 400, json: ["code": "validation_failed", "issues": issues])
            return
        }
        if let locale { preferredLocale = locale }
        if let given { name = given }
        send(connection, status: 200, json: account)
    }

    static let teamMemberID = "5b1c2d3e-0000-4000-8000-000000000009"

    static func isTrainerProfile(_ path: String) -> Bool {
        path.hasPrefix("/api/v1/workspaces/") && path.hasSuffix("/trainer-profile")
    }

    /// `PUT` / `DELETE /api/v1/workspaces/{id}/trainer-profile` (F005): `404` for a workspace the account is not on the
    /// team of, `403` without `team.manage`, otherwise the Owner's switch; held while `holdTrainerProfileRequests`, and
    /// refused with a status the test gave.
    func respondToTrainerProfile(_ connection: NWConnection, method: String, path: String, authorization: String?) {
        guard authorization == "Bearer \(signIn.token)" else {
            send(connection, status: 401, json: Self.notSignedIn)
            return
        }
        let id = String(path.dropFirst("/api/v1/workspaces/".count).dropLast("/trainer-profile".count))
        guard let entry = teamWorkspaceEntries.first(where: { Self.workspaceID($0.index) == id }) else {
            send(connection, status: 404, json: ["code": "not_found"])
            return
        }
        guard Self.capabilities(ofRole: entry.workspace.role).contains("team.manage") else {
            send(connection, status: 403, json: ["code": "forbidden"])
            return
        }
        let answer: @Sendable () -> Void = { [self] in
            if let status = trainerStatus {
                send(connection, status: status, json: nil)
            } else if method == "PUT" {
                setTrains(true, at: entry.index)
                send(connection, status: 200, json: ["teamMemberId": Self.teamMemberID, "trainsHere": true])
            } else {
                setTrains(false, at: entry.index)
                send(connection, status: 204, json: nil)
            }
        }
        if !holdTrainerCall(answer) { answer() }
    }

    func respondToMe(_ connection: NWConnection, authorization: String?) {
        if let status = signIn.meStatus {
            send(connection, status: status, json: nil)
            return
        }
        let works = authorization == "Bearer \(signIn.token)"
        send(connection, status: works ? 200 : 401, json: works ? account : Self.notSignedIn)
    }
}
