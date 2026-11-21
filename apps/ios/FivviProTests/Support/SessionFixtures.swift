import Foundation
import FivviAPI

@testable import FivviPro

/// Synthetic data for the private session tests (F020): a workspace in Europe/Amsterdam, a clock, and clients.
enum SessionFixtures {
    static let amsterdam = TimeZone(identifier: "Europe/Amsterdam") ?? .current

    /// The workspace as the Owner (`StubSessions.myMemberID`) has it.
    static let workspace = workspace(as: StubSessions.myMemberID)

    /// The same workspace for the person whose team-member ID there is `teamMemberId`.
    static func workspace(as teamMemberId: String) -> CurrentWorkspace {
        CurrentWorkspace(
            id: "7c1d2e3f-0000-4000-8000-000000000000", name: "John's Gym", defaultLocale: .nlNL, timeZone: amsterdam,
            teamMemberId: teamMemberId
        )
    }

    /// Monday 16 November 2026, 08:20 in Amsterdam: the form's first start is 09:00 the same day.
    static let now = StubSessions.date("2026-11-16", "08:20", "Europe/Amsterdam") ?? Date()

    /// A StubAPI of the workspace with Anna (writes English) and Mark (follows the workspace's Dutch).
    static func api() -> StubAPI {
        let api = StubAPI()
        api.clients.seed([
            .init("Anna de Vries", "anna@example.com", .en), .init("Mark Jansen", "mark@example.com", nil)
        ])
        return api
    }

    static func client(_ api: StubAPI, _ name: String) -> Components.Schemas.Client {
        guard let client = api.clients.all.first(where: { $0.name == name }) else { fatalError("no client \(name)") }
        return client
    }

    /// An instant given as local time in Amsterdam.
    static func at(_ day: String, _ time: String) -> Date {
        StubSessions.date(day, time, "Europe/Amsterdam") ?? Date()
    }
}
