import FivviAPI

/// Which workspace the app opens on (F012, spec #423): the one the person used last on this phone while they are
/// still on its team, otherwise the first one `GET /api/v1/me` lists. A small pure function that only picks from that
/// list, so it holds no business rule: who is on which team, and the order by name (the API sorts them), are the
/// server's answer; a removed team access is simply a workspace missing from the list (or answered `404`, F003 AC6,
/// and the next one in `order` is tried).
enum StartWorkspace {
    typealias Workspace = Components.Schemas.MeWorkspace

    /// The workspaces in the order the app tries them: the `remembered` one first, when it is in the list, then the
    /// others in the order the API sent them (by name). The first of the result is the one to open on; none means
    /// the person is on no team.
    static func order(_ workspaces: [Workspace], remembered: String?) -> [Workspace] {
        guard let remembered, let index = workspaces.firstIndex(where: { $0.id == remembered }) else {
            return workspaces
        }
        var ordered = workspaces
        ordered.insert(ordered.remove(at: index), at: 0)
        return ordered
    }
}
