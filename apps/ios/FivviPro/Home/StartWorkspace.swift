import FivviAPI

/// Which workspace the app opens on (F012, spec #423): the one the person used last on this phone while they are
/// still on its team, otherwise the first by name. A small pure function that only picks from the list `GET /api/v1/me`
/// gave, so it holds no business rule: who is on which team is the server's answer, a removed team access is simply a
/// workspace missing from the list (or answered `404`, F003 AC6, and the next one in `order` is tried).
enum StartWorkspace {
    typealias Workspace = Components.Schemas.MeWorkspace

    /// The workspaces in the order the app tries them: the `remembered` one first, when it is in the list, then the
    /// others by name (case and accents ignored; the ID settles two with the same name).
    static func order(_ workspaces: [Workspace], remembered: String?) -> [Workspace] {
        let byName = workspaces.sorted { left, right in
            switch left.name.compare(right.name, options: [.caseInsensitive, .diacriticInsensitive]) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame: left.id < right.id
            }
        }
        guard let remembered, let index = byName.firstIndex(where: { $0.id == remembered }) else { return byName }
        var ordered = byName
        ordered.insert(ordered.remove(at: index), at: 0)
        return ordered
    }

    /// The workspace to open on, or nil when the person is on no team.
    static func pick(from workspaces: [Workspace], remembered: String?) -> Workspace? {
        order(workspaces, remembered: remembered).first
    }
}
