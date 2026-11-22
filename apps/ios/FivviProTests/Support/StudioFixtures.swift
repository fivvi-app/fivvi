import Foundation
import OpenAPIRuntime
import FivviAPI

@testable import FivviPro

/// Synthetic data for the Owner's *Hele studio* (F014): John's Gym on Tuesday 22 September 2026 as
/// `GET /api/v1/workspaces/{id}/day` answers it for John, the Owner who also trains, with Sarah and Tom as trainers
/// (synthetic IDs; the names are the spec's).
enum StudioFixtures {
    typealias Item = Components.Schemas.WorkspaceCalendarSession
    typealias Day = Components.Schemas.WorkspaceDay

    static let day = PersonalFixtures.day
    static let johnID = "5b1c2d3e-0000-4000-8000-0000000000c1"
    static let sarahID = "5b1c2d3e-0000-4000-8000-0000000000c2"
    static let tomID = "5b1c2d3e-0000-4000-8000-0000000000c3"
    static let john = Components.Schemas.Trainer(id: johnID, name: "John Visser")
    static let sarah = Components.Schemas.Trainer(id: sarahID, name: "Sarah de Boer")
    static let tom = Components.Schemas.Trainer(id: tomID, name: "Tom Bakker")

    /// John's Gym as John has it.
    static let workspace = CurrentWorkspace(
        id: "7c1d2e3f-0000-4000-8000-0000000000d1", name: "John's Gym", defaultLocale: .nlNL,
        timeZone: SessionFixtures.amsterdam, teamMemberId: johnID
    )

    /// The `allOf` of the contract: the trainer, and the container of what the schema adds (the description only).
    private static func payload(_ trainer: Components.Schemas.Trainer) -> Item.TrainerPayload {
        let nothing: OpenAPIValueContainer = nil
        return .init(value1: .init(id: trainer.id, name: trainer.name), value2: nothing)
    }

    static func session(
        _ id: String, from start: String, to end: String, trainer: Components.Schemas.Trainer? = nil,
        client: String? = nil, className: String? = nil, cancelled: Bool = false, day: String = StudioFixtures.day
    ) -> Item {
        let isGroup = className != nil
        return Item(
            id: id, _type: isGroup ? .group : ._private, status: cancelled ? .cancelled : .scheduled,
            startsAt: PersonalFixtures.at(start, day), endsAt: PersonalFixtures.at(end, day),
            timeZone: "Europe/Amsterdam", capacity: isGroup ? 8 : 1, version: 1, booked: isGroup ? 0 : nil,
            location: PersonalFixtures.place("John's Gym"),
            trainer: trainer.map(payload),
            className: className, clientName: client
        )
    }

    static let mark = session("mark", from: "07:00", to: "08:00", trainer: sarah, client: "Mark Jansen")
    static let kracht = session("kracht", from: "10:00", to: "11:00", trainer: sarah, className: "Kracht")
    static let lisa = session("lisa", from: "11:00", to: "12:00", trainer: tom, client: "Lisa Smit")
    static let anna = session("anna", from: "18:00", to: "19:00", trainer: john, client: "Anna de Vries")
    static let boxing = session("boxing", from: "18:00", to: "19:00", trainer: sarah, className: "Boxing")
    static let krachtCancelled = session(
        "kracht-late", from: "20:00", to: "21:00", trainer: tom, className: "Kracht", cancelled: true
    )

    /// The busiest moment as the API words it: 18:00–19:00, two at once.
    static let busiest = Components.Schemas.WorkspaceBusiestMoment(
        startsAt: PersonalFixtures.at("18:00"), endsAt: PersonalFixtures.at("19:00"), timeZone: "Europe/Amsterdam",
        atOnce: 2
    )

    /// John's day: five sessions of three trainers, two of them at 18:00, and a cancelled class.
    static func johnsDay(
        items: [Item] = [mark, kracht, lisa, anna, boxing, krachtCancelled],
        busiest: Components.Schemas.WorkspaceBusiestMoment? = StudioFixtures.busiest
    ) -> Day {
        Day(date: day, timeZone: "Europe/Amsterdam", items: items, busiest: busiest, attention: [], hasSessions: true)
    }

    /// A day with no sessions.
    static let emptyDay = Day(
        date: day, timeZone: "Europe/Amsterdam", items: [], attention: [], hasSessions: true
    )
}
