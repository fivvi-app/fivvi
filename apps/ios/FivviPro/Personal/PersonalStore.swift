import Foundation

/// What the personal screens keep on the phone for the offline view (F013 AC7, spec #457): the last `GET /api/v1/me/day`
/// answer and the workspaces the person was on, to notice one that is gone. Read only: nothing is queued. It holds
/// client names, so it is a file with complete file protection, kept out of backups, and it goes with the sign-out.
protocol PersonalStore: AnyObject, Sendable {
    func read(_ name: String) -> Data?
    func write(_ data: Data, as name: String)
    /// Forgets everything: a sign-out, or another account.
    func clear()
}

final class FilePersonalStore: PersonalStore, Sendable {
    static let shared = FilePersonalStore()

    private let directory: URL

    init(directory: URL = URL.applicationSupportDirectory.appending(path: "personal", directoryHint: .isDirectory)) {
        self.directory = directory
    }

    func read(_ name: String) -> Data? {
        try? Data(contentsOf: directory.appending(path: name))
    }

    func write(_ data: Data, as name: String) {
        var folder = directory
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var excluded = URLResourceValues()
        excluded.isExcludedFromBackup = true
        try? folder.setResourceValues(excluded)
        try? data.write(to: folder.appending(path: name), options: [.atomic, .completeFileProtection])
    }

    func clear() {
        try? FileManager.default.removeItem(at: directory)
    }
}

/// The day and the workspaces as the phone keeps them.
struct PersonalCache {
    let store: any PersonalStore

    struct Day: Codable {
        let day: PersonalDay
        let savedAt: Date
    }

    /// A workspace the person is on, by ID and name: the name is what the notice says once it is gone.
    struct Workspace: Codable, Equatable {
        let id: String
        let name: String
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    var day: Day? {
        get { store.read("day.json").flatMap { try? Self.decoder.decode(Day.self, from: $0) } }
        nonmutating set { newValue.flatMap { try? Self.encoder.encode($0) }.map { store.write($0, as: "day.json") } }
    }

    var workspaces: [Workspace]? {
        get { store.read("workspaces.json").flatMap { try? Self.decoder.decode([Workspace].self, from: $0) } }
        nonmutating set {
            newValue.flatMap { try? Self.encoder.encode($0) }.map { store.write($0, as: "workspaces.json") }
        }
    }
}
