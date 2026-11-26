import Foundation
import FivviAPI

@testable import FivviPro

/// Synthetic data for attendance (F025): "Kracht" on Tuesday 22 September 2026, 18:00–19:00, with seven participants of
/// the seeded clients (the spec's names and the web's helper), and Anna's private session at 09:00.
enum AttendanceFixtures {
    static let workspace = SessionFixtures.workspace
    static let sessionID = "kracht-session"

    /// 17:20: before the window (opens 17:30).
    static let early = PersonalFixtures.at("17:20")
    /// 18:10: the class has started.
    static let started = PersonalFixtures.at("18:10")
    static let opensAt = PersonalFixtures.at("17:30")

    static let names = [
        "Anna de Vries", "Bram Jansen", "Chris Bakker", "Dana Visser", "Eva Mulder", "Finn Smit", "Gijs de Boer"
    ]

    static func id(_ name: String) -> String {
        "client-" + (name.split(separator: " ").first.map(String.init) ?? name).lowercased()
    }

    /// A participant as the stub holds it.
    struct Person {
        let id: String
        let name: String
        let status: Components.Schemas.AttendanceParticipant.StatusPayload
    }

    /// The seven participants, all *Geboekt*; `status` overrides one by first name.
    static func people(
        _ overrides: [String: Components.Schemas.AttendanceParticipant.StatusPayload] = [:]
    ) -> [Person] {
        names.map { name in
            let key = String(name.split(separator: " ")[0])
            return Person(id: id(name), name: name, status: overrides[key] ?? .booked)
        }
    }
}
