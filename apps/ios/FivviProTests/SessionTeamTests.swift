import FivviAPI
import XCTest

@testable import FivviPro

/// Who the person is among a workspace's trainers (F020, iOS): the API has no "me" on a trainer.
final class SessionTeamTests: XCTestCase {
    private let trainers: [Components.Schemas.Trainer] = [
        .init(id: "11111111-0000-4000-8000-000000000001", name: "Owner"),
        .init(id: "11111111-0000-4000-8000-000000000002", name: "Sarah Visser"),
        .init(id: "11111111-0000-4000-8000-000000000003", name: "Sarah Visser")
    ]
    private let members: [Components.Schemas.TeamMember] = [
        .init(id: "11111111-0000-4000-8000-000000000001", name: "Owner", email: "owner@example.com", role: .owner),
        .init(id: "11111111-0000-4000-8000-000000000009", name: "No profile", email: "np@example.com", role: .owner)
    ]

    func test_F020_AC2_theTeamFindsThePersonByTheirAddressWhateverItsCase() {
        let id = SessionTeam.myTrainerID(trainers: trainers, members: members, email: "OWNER@example.com", name: nil)
        XCTAssertEqual(id, "11111111-0000-4000-8000-000000000001")
    }

    func test_F020_AC2_aTeamMemberWithoutATrainerProfileIsNotAmongTheTrainers() {
        XCTAssertNil(SessionTeam.myTrainerID(trainers: trainers, members: members, email: "np@example.com", name: nil))
        XCTAssertNil(
            SessionTeam.myTrainerID(trainers: trainers, members: members, email: "other@example.com", name: nil)
        )
    }

    func test_F020_AC10_withoutTheTeamTheNameFindsThemOnlyWhenItIsTheOnlyOne() {
        XCTAssertEqual(
            SessionTeam.myTrainerID(trainers: trainers, members: nil, email: "x@example.com", name: "Owner"),
            "11111111-0000-4000-8000-000000000001"
        )
        XCTAssertNil(
            SessionTeam.myTrainerID(trainers: trainers, members: nil, email: "x@example.com", name: "Sarah Visser"),
            "two trainers with the name: not told"
        )
        XCTAssertNil(SessionTeam.myTrainerID(trainers: trainers, members: nil, email: "x@example.com", name: nil))
    }
}
