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
        let list = [workspace("Sarah Personal Training"), workspace("John's Gym")]

        XCTAssertEqual(
            StartWorkspace.pick(from: list, remembered: "id-gone")?.name, "John's Gym",
            "a remembered workspace the person left: the first by name"
        )
        XCTAssertEqual(StartWorkspace.pick(from: [workspace("John's Gym")], remembered: "id-gone")?.name, "John's Gym")
        XCTAssertNil(StartWorkspace.pick(from: [], remembered: "id-gone"), "none left: no workspace")
        XCTAssertNil(StartWorkspace.pick(from: [], remembered: nil))
    }

    func test_F012_AC7_startWorkspaceIsTheRememberedOne() {
        let list = [workspace("John's Gym"), workspace("Sarah Personal Training")]

        XCTAssertEqual(
            StartWorkspace.pick(from: list, remembered: "id-Sarah Personal Training")?.name, "Sarah Personal Training"
        )
        XCTAssertEqual(StartWorkspace.pick(from: list, remembered: nil)?.name, "John's Gym", "nothing remembered")
    }

    func test_F012_AC5_orderIsTheRememberedOneThenTheOthersByName() {
        let list = [workspace("Zeta"), workspace("alpha"), workspace("Émile"), workspace("Beta")]

        XCTAssertEqual(names(StartWorkspace.order(list, remembered: nil)), ["alpha", "Beta", "Émile", "Zeta"])
        XCTAssertEqual(
            names(StartWorkspace.order(list, remembered: "id-Zeta")), ["Zeta", "alpha", "Beta", "Émile"]
        )
        XCTAssertEqual(
            names(StartWorkspace.order(list, remembered: "id-unknown")), ["alpha", "Beta", "Émile", "Zeta"],
            "an unknown ID changes nothing"
        )
    }

    func test_F012_AC5_twoWorkspacesWithTheSameNameKeepAStableOrder() {
        let list = [workspace("Gym", id: "b"), workspace("Gym", id: "a")]

        XCTAssertEqual(StartWorkspace.order(list, remembered: nil).map(\.id), ["a", "b"])
    }
}
