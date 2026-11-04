import FivviAPI
import XCTest

@testable import FivviPro

/// Which workspace the app opens on (F012, spec #423): a small pure function that only picks from the list
/// `GET /api/v1/me` gave. No business rule: the server's list decides who is on which team.
final class StartWorkspaceTests: XCTestCase {
    private func workspace(_ name: String, id: String? = nil) -> Components.Schemas.MeWorkspace {
        .init(id: id ?? "id-\(name)", name: name, slug: name.lowercased(), role: .trainer, capabilities: [])
    }

    private func names(_ workspaces: [Components.Schemas.MeWorkspace]) -> [String] { workspaces.map(\.name) }

    func test_F012_AC5_startWorkspaceFallsBack() {
        let list = [workspace("John's Gym"), workspace("Sarah Personal Training")]  // the API's order

        XCTAssertEqual(
            StartWorkspace.order(list, remembered: "id-gone").first?.name, "John's Gym",
            "a remembered workspace the person left: the first the API listed"
        )
        XCTAssertEqual(StartWorkspace.order([workspace("John's Gym")], remembered: "id-gone").first?.name, "John's Gym")
        XCTAssertNil(StartWorkspace.order([], remembered: "id-gone").first, "none left: no workspace")
        XCTAssertNil(StartWorkspace.order([], remembered: nil).first)
    }

    func test_F012_AC7_startWorkspaceIsTheRememberedOne() {
        let list = [workspace("John's Gym"), workspace("Sarah Personal Training")]

        XCTAssertEqual(
            StartWorkspace.order(list, remembered: "id-Sarah Personal Training").first?.name, "Sarah Personal Training"
        )
        XCTAssertEqual(StartWorkspace.order(list, remembered: nil).first?.name, "John's Gym", "nothing remembered")
    }

    func test_F012_AC5_orderIsTheRememberedOneThenTheOthersInTheAPIsOrder() {
        // The API sends the list sorted by name (`GET /api/v1/me`); the app keeps that order and only moves the
        // remembered workspace to the front, so "the first by name" is the same on web, Android and iOS.
        let list = [workspace("alpha"), workspace("Beta"), workspace("Zeta"), workspace("Émile")]

        XCTAssertEqual(names(StartWorkspace.order(list, remembered: nil)), ["alpha", "Beta", "Zeta", "Émile"])
        XCTAssertEqual(
            names(StartWorkspace.order(list, remembered: "id-Zeta")), ["Zeta", "alpha", "Beta", "Émile"]
        )
        XCTAssertEqual(
            names(StartWorkspace.order(list, remembered: "id-unknown")), ["alpha", "Beta", "Zeta", "Émile"],
            "an unknown ID changes nothing"
        )
    }

    func test_F012_AC5_twoWorkspacesWithTheSameNameKeepTheAPIsOrder() {
        let list = [workspace("Gym", id: "b"), workspace("Gym", id: "a")]

        XCTAssertEqual(StartWorkspace.order(list, remembered: nil).map(\.id), ["b", "a"])
        XCTAssertEqual(StartWorkspace.order(list, remembered: "a").map(\.id), ["a", "b"])
    }
}
