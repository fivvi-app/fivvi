import Foundation
import FivviAPI

@testable import FivviPro

/// Synthetic data for the personal scope (F013): Sarah's Tuesday 22 September 2026, as `GET /api/v1/me/day` answers it
/// at 08:35 for an account on two teams (synthetic IDs; the names are the spec's).
enum PersonalFixtures {
    static let day = "2026-09-22"
    static let sarahPT = Components.Schemas.PersonalWorkspace(
        id: "7c1d2e3f-0000-4000-8000-0000000000a1", slug: "sarah-personal-training", name: "Sarah Personal Training"
    )
    static let johns = Components.Schemas.PersonalWorkspace(
        id: "7c1d2e3f-0000-4000-8000-0000000000a2", slug: "johns-gym", name: "John's Gym"
    )

    static func at(_ time: String, _ day: String = PersonalFixtures.day) -> Date { SessionFixtures.at(day, time) }

    /// 08:35 on 22 September.
    static let now = at("08:35")

    static func place(_ name: String, address: Bool = true) -> Components.Schemas.Location {
        .init(
            id: "5b1c2d3e-0000-4000-8000-000000000e01", name: name, _type: .externalGym,
            address: address ? .init(
                postcode: "1011AB", houseNumber: "1", houseNumberAddition: nil, street: "Voorbeeldstraat",
                city: "Amsterdam"
            ) : nil,
            isDefault: true
        )
    }

    static func session(
        _ id: String, _ workspace: Components.Schemas.PersonalWorkspace, from start: String, to end: String,
        client: String? = nil, className: String? = nil, booked: Int? = nil, capacity: Int = 1, cancelled: Bool = false,
        place name: String? = nil, day: String = PersonalFixtures.day
    ) -> PersonalItem {
        PersonalItem(
            sessionId: id, workspace: workspace, _type: className == nil ? ._private : .group,
            status: cancelled ? .cancelled : .scheduled, startsAt: at(start, day), endsAt: at(end, day),
            timeZone: "Europe/Amsterdam", capacity: capacity, booked: booked, className: className,
            location: name.map { place($0) }, clientName: client
        )
    }

    static let anna = session(
        "anna", sarahPT, from: "09:00", to: "10:00", client: "Anna de Vries", place: "TrainMore Zuid"
    )
    static let mark = session("mark", johns, from: "11:00", to: "12:00", client: "Mark Jansen", place: "John's Gym")
    static let kracht = session(
        "kracht", johns, from: "15:00", to: "16:00", className: "Kracht", booked: 0, capacity: 8
    )
    static let krachtCancelled = session(
        "kracht-late", johns, from: "18:00", to: "19:00", className: "Kracht", booked: 0, capacity: 8, cancelled: true
    )

    /// Sarah's day: four items in two workspaces, Anna next, a free gap and two places ahead.
    static func sarah(
        items: [PersonalItem] = [anna, mark, kracht, krachtCancelled], workspaceCount: Int = 2,
        done: Int = 0, gap: (String, String)? = ("12:00", "13:30"), places: [String] = ["TrainMore Zuid", "John's Gym"]
    ) -> PersonalDay {
        let first = items.first, last = items.last
        return PersonalDay(
            date: day, timeZone: "Europe/Amsterdam", workspaceCount: workspaceCount, items: items,
            summary: .init(
                count: items.count, done: done, firstStartsAt: first?.startsAt, lastEndsAt: last?.endsAt
            ),
            next: first.map { .init(sessionId: $0.sessionId, state: .upcoming, startsInMinutes: 25) },
            freeGap: gap.map { .init(startsAt: at($0.0), endsAt: at($0.1)) },
            placesAhead: places.map { .init(name: $0) },
            tomorrow: .init(date: "2026-09-23", count: 3, firstStartsAt: at("07:00", "2026-09-23")),
            hasSessions: true
        )
    }

    /// A day with no sessions.
    static func empty(
        nextSession: String? = nil, hasSessions: Bool = true, tomorrow: Bool = false
    ) -> PersonalDay {
        PersonalDay(
            date: day, timeZone: "Europe/Amsterdam", workspaceCount: 1, items: [], summary: .init(count: 0, done: 0),
            tomorrow: tomorrow ? .init(date: "2026-09-23", count: 3, firstStartsAt: at("07:00", "2026-09-23")) : nil,
            // As the API answers: with sessions tomorrow, tomorrow is also the date of the next one.
            nextSessionDate: nextSession ?? (tomorrow ? "2026-09-23" : nil), hasSessions: hasSessions
        )
    }

    /// Open Gym comes later (`PRODUCT.md §53`): no screen shows it.
    static let openGym = PersonalItem(
        sessionId: "gym", workspace: johns, _type: .openGym, status: .scheduled, startsAt: at("13:00"),
        endsAt: at("14:00"), timeZone: "Europe/Amsterdam", capacity: 10, booked: 3
    )

    /// The week of Monday 21 to Sunday 27 September 2026 as `GET /api/v1/me/sessions` answers it: Sarah's Tuesday of
    /// the spec, and three sessions from 07:00 on Wednesday 23 September (the footer of Vandaag).
    static let septemberWeek: [PersonalItem] = [
        anna, mark, kracht, krachtCancelled,
        session("early", johns, from: "07:00", to: "08:00", client: "Eva Kok", day: "2026-09-23"),
        session("mid", sarahPT, from: "10:00", to: "11:00", client: "Lisa Smit", day: "2026-09-23"),
        session(
            "evening", johns, from: "17:00", to: "18:00", className: "Boksen", booked: 2, capacity: 8, day: "2026-09-23"
        )
    ]

    /// The weeks of 19 and 26 October 2026: the clocks go back in the night to Sunday 25 October, and the class
    /// "Kracht" is at 18:00 on both Tuesdays.
    static let octoberWeeks: [PersonalItem] = [
        session(
            "kracht-20", johns, from: "18:00", to: "19:00", className: "Kracht", booked: 3, capacity: 8,
            day: "2026-10-20"
        ),
        session("mark-22", johns, from: "11:00", to: "12:00", client: "Mark Jansen", day: "2026-10-22"),
        session(
            "kracht-27", johns, from: "18:00", to: "19:00", className: "Kracht", booked: 5, capacity: 8,
            day: "2026-10-27"
        )
    ]
}
