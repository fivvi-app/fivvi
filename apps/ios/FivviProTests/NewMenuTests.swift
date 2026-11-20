import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The **+** menu by role (F021 AC7, F020): *Groepsles* for whoever has `class.manage`, a footnote for a team member who
/// plans sessions but not classes. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class NewMenuTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private let johnsGym = "7c1d2e3f-0000-4000-8000-000000000001"

    private func capabilities(_ allowed: [WorkspaceCapabilities.Capability]) -> WorkspaceCapabilities {
        let helper = WorkspaceCapabilities()
        helper.replace(
            with: [.init(
                id: johnsGym, name: "John's Gym", slug: "johns-gym", trainerWord: .trainer, role: .owner,
                teamMemberId: StubSessions.myMemberID, capabilities: allowed
            )],
            current: johnsGym
        )
        return helper
    }

    func test_F021_AC7_theOwnerHasPrivateSessionAndGroupClassAndNoFootnote() {
        let menu = NewMenu(capabilities: capabilities([
            .session_private_manage_own, .session_private_manage_any, .class_manage, .class_read
        ]))
        XCTAssertTrue(menu.showsPrivateSession)
        XCTAssertTrue(menu.showsGroupClass)
        XCTAssertFalse(menu.showsGroupClassNote)
        XCTAssertTrue(menu.isVisible)
    }

    func test_F021_AC7_aTrainerHasPrivateSessionNoGroupClassAndTheFootnote() {
        let menu = NewMenu(capabilities: capabilities([.session_private_manage_own, .class_read]))
        XCTAssertTrue(menu.showsPrivateSession)
        XCTAssertFalse(menu.showsGroupClass, "Sarah's + has no Groepsles")
        XCTAssertTrue(menu.showsGroupClassNote)
        let catalog = TestCatalog(language)
        XCTAssertEqual(
            menu.groupClassNote(workspaceName: "John's Gym", catalog: Catalog(locale: language)),
            String(format: catalog["workspaceNav.newGroupClassNote"], "John's Gym"),
            "Groepslessen van John's Gym plant de eigenaar."
        )
    }

    func test_F021_AC7_aMemberWhoPlansNothingHasNoMenuAtAll() {
        let menu = NewMenu(capabilities: capabilities([.clients_view]))
        XCTAssertFalse(menu.isVisible)
        XCTAssertFalse(menu.showsGroupClassNote)
    }

    func test_F021_AC7_anOwnerWhoOnlyManagesClassesStillGetsGroupClassFromTheCapability() {
        let menu = NewMenu(capabilities: capabilities([.session_private_manage_any, .class_manage]))
        XCTAssertTrue(menu.showsGroupClass)
        XCTAssertFalse(menu.showsGroupClassNote)
    }
}
