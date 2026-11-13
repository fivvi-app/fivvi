import SwiftUI
import UIKit
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// *Klanten* / *Clients* (TM-02, F006 AC6, E020 AC14): the list asks for the next page when its last row comes on
/// screen, not before. The rows sit in a lazy stack: in a plain one every row's task ran at once and opening the list
/// read every page.
@MainActor
final class ClientsListPagingTests: XCTestCase {
    private let workspace = CurrentWorkspace(
        id: "7c1d2e3f-0000-4000-8000-000000000001", name: "John's Gym", defaultLocale: .nlNL,
        timeZone: TimeZone(identifier: "Europe/Amsterdam") ?? .current
    )

    /// Laid out in a phone-sized window, with 200 synthetic clients, 40 to a page.
    private func hostClients(_ api: StubAPI) throws -> (UIWindow, ClientsViewModel) {
        api.clients.seed((1 ... 200).map { .init(String(format: "Klant %03d", $0), "klant\($0)@example.com", nil) })
        let language = AppLanguage(
            api: api, store: InMemorySessionStore(token: "stored-token"), defaults: try emptyDefaults(),
            sources: LanguageSources(perApp: nil, device: ["nl-NL"])
        )
        let model = ClientsViewModel(
            api: api, workspace: workspace, catalog: language.catalog, pageSize: 40, onForbidden: { _ in }
        )
        let view = NavigationStack {
            ClientsView(model: model, language: language, capabilities: WorkspaceCapabilities(), onOpen: { _ in })
        }
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first, "the app has a scene"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        addTeardownBlock { window.isHidden = true }
        return (window, model)
    }

    /// The list's scroll view: the one with more to show than fits.
    private func scrollView(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView, scroll.contentSize.height > scroll.bounds.height { return scroll }
        for subview in view.subviews {
            if let found = scrollView(in: subview) { return found }
        }
        return nil
    }

    private func settle(_ seconds: TimeInterval = 1.5) {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds))
    }

    func test_E020_AC14_openingTheListAsksForPageOneOnly() throws {
        let api = StubAPI()
        let (window, model) = try hostClients(api)
        settle()

        XCTAssertEqual(model.clients.count, 40, "the first page is on screen")
        XCTAssertEqual(api.clients.pages, [1], "the rows below the screen don't ask for the next page")
        withExtendedLifetime(window) {}
    }

    func test_E020_AC14_scrollingToTheEndAsksForTheNextPage() throws {
        let api = StubAPI()
        let (window, model) = try hostClients(api)
        settle()
        let root = try XCTUnwrap(window.rootViewController?.view)
        let scroll = try XCTUnwrap(scrollView(in: root), "the list scrolls")

        scroll.setContentOffset(
            CGPoint(x: 0, y: scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom),
            animated: false
        )
        settle()

        XCTAssertEqual(api.clients.pages.first, 1)
        XCTAssertTrue(api.clients.pages.contains(2), "the last row came on screen and asked for page 2")
        XCTAssertGreaterThan(model.clients.count, 40)
    }
}
