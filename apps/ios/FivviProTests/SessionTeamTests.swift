import FivviAPI
import XCTest

@testable import FivviPro

/// Who the person is among a workspace's trainers (F020, iOS): by the team-member ID of `GET /api/v1/me`, never by
/// address or name.
final class SessionTeamTests: XCTestCase {
    private let trainers: [Components.Schemas.Trainer] = [
        .init(id: "11111111-0000-4000-8000-000000000001", name: "Owner"),
        .init(id: "11111111-0000-4000-8000-000000000002", name: "Sarah Visser"),
        .init(id: "11111111-0000-4000-8000-000000000003", name: "Sarah Visser")
    ]

    func test_F020_1414_AC2_thePersonIsTheTrainerWithTheirOwnTeamMemberID() {
        XCTAssertEqual(
            SessionTeam.myTrainerID(trainers: trainers, teamMemberID: "11111111-0000-4000-8000-000000000001"),
            "11111111-0000-4000-8000-000000000001"
        )
    }

    func test_F020_1414_AC2_twoTrainersWithTheSameNameAreToldApartByTheID() {
        XCTAssertEqual(
            SessionTeam.myTrainerID(trainers: trainers, teamMemberID: "11111111-0000-4000-8000-000000000003"),
            "11111111-0000-4000-8000-000000000003"
        )
    }

    func test_F020_AC2_aTeamMemberWithoutATrainerProfileIsNotAmongTheTrainers() {
        XCTAssertNil(SessionTeam.myTrainerID(trainers: trainers, teamMemberID: "11111111-0000-4000-8000-000000000009"))
    }
}
