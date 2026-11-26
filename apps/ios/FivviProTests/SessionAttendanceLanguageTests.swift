import SwiftUI
import UIKit
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-02's *Aanwezigheid* section follows a language change (F025 #1619): the screen is hosted for real, so it is the
/// view's own wiring that is under test, not only the model's `use(_:)`.
@MainActor
final class SessionAttendanceLanguageTests: XCTestCase {
    func test_F025_1619_td02AttendanceReadsInTheNewLanguageAfterALanguageChange() throws {
        let api = SessionFixtures.api()
        let session = api.sessions.seed(
            client: SessionFixtures.client(api, "Anna de Vries"), start: SessionFixtures.at("2026-11-19", "09:00"),
            trainer: .init(id: StubSessions.myMemberID, name: "Owner")
        )
        api.attendance.serve(AttendanceFixtures.people(), type: ._private, opensAt: AttendanceFixtures.opensAt)
        let language = AppLanguage(
            api: api, store: InMemorySessionStore(token: "stored-token"), defaults: try emptyDefaults(),
            sources: LanguageSources(perApp: nil, device: ["nl-NL"])
        )
        let workspace = SessionFixtures.workspace
        let model = SessionViewModel(
            api: api, workspace: workspace, sessionID: session.id, catalog: language.catalog
        )
        let queue = AttendanceQueue(api: api, store: MemoryPersonalStore(), isOnline: { true }, retryAfter: nil)
        let attendance = AttendanceModel(
            api: api, workspace: workspace, sessionID: session.id, catalog: language.catalog, queue: queue,
            now: { AttendanceFixtures.started }
        )
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first, "the app has a scene"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = UIHostingController(rootView: NavigationStack {
            SessionView(model: model, attendance: attendance, language: language, canMove: true, onOpenClient: nil)
        })
        window.makeKeyAndVisible()
        addTeardownBlock { window.isHidden = true }
        settle(until: { model.state == .loaded && attendance.state == .loaded })
        let dutch = TestCatalog(.nlNL)
        let english = TestCatalog(.en)
        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(attendance.state, .loaded)
        XCTAssertEqual(attendance.summaryText, String(format: dutch["attendance.summary"], "0", "0", "7"))

        let englishSummary = String(format: english["attendance.summary"], "0", "0", "7")

        language.choose(.en)
        settle(until: { attendance.summaryText == englishSummary })

        XCTAssertEqual(attendance.summaryText, englishSummary, "the section reads in English")
        XCTAssertEqual(model.title, String(format: english["sessions.page.heading"], "Anna de Vries"))
        withExtendedLifetime(window) {}
    }
}
