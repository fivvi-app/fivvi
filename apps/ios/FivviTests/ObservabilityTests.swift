import Sentry
import XCTest

@testable import Fivvi
@testable import FivviObservability

/// E017 AC10: what the client app would send to Sentry. The scrubber itself is tested with Fivvi Pro's app
/// (`ObservabilityTests` in FivviProTests); here the app's own configuration: events carry `app: fivvi` and the platform,
/// and no email address, name, workspace name or token. The data is synthetic.
final class ObservabilityTests: XCTestCase {
    private enum Synthetic {
        static let email = "anna@example.com"
        static let name = "Anna de Vries"
        static let workspace = "John's Gym"
        static let token = "stub-session-token"
        static let accountID = "2f6a1f0e-0000-4000-8000-000000000001"
        static let workspaceID = "7c1d2e3f-0000-4000-8000-000000000000"
    }

    private func info(app: String? = "fivvi") -> [String: Any] {
        var info: [String: Any] = [
            ErrorReporting.dsnKey: "https://public@o0.ingest.de.sentry.io/1",
            ErrorReporting.environmentKey: "production",
            "CFBundleIdentifier": "app.fivvi",
            "CFBundleShortVersionString": "0.1.0",
            "CFBundleVersion": "1"
        ]
        if let app { info[ErrorReporting.appKey] = app }
        return info
    }

    /// An error event with personal data in every field that can hold it, and tags set on the scope.
    private func event() -> Event {
        let event = Event(level: .error)
        event.message = SentryMessage(formatted: "Could not load \(Synthetic.email)")
        event.serverName = "iPhone van \(Synthetic.name)"
        event.tags = ["app": "other", "platform": "other", "workspace": Synthetic.workspace, "name": Synthetic.name]
        event.extra = ["workspace": Synthetic.workspace, "token": Synthetic.token]
        event.user = User(userId: Synthetic.accountID)
        event.user?.email = Synthetic.email
        event.user?.username = Synthetic.name
        event.user?.data = ["organization_id": Synthetic.workspaceID, "workspaceName": Synthetic.workspace]
        let request = SentryRequest()
        request.url = "https://api.example.com/api/v1/me?email=\(Synthetic.email)"
        request.headers = ["Authorization": "Bearer \(Synthetic.token)", "Content-Type": "application/json"]
        event.request = request
        let breadcrumb = Breadcrumb(level: .info, category: "console")
        breadcrumb.message = "Signed in as \(Synthetic.email) with \(Synthetic.token)"
        event.breadcrumbs = [breadcrumb]
        return event
    }

    private func sent(_ event: Event, app: String? = "fivvi") throws -> [String: Any] {
        let configuration = try XCTUnwrap(ErrorReporting.Configuration(info: info(app: app)))
        let beforeSend = try XCTUnwrap(ErrorReporting.options(for: configuration).beforeSend)
        return try XCTUnwrap(beforeSend(event)).serialize()
    }

    func test_E017_AC10_theConfigurationNamesTheAppAndTheReleaseAfterTheBundle() throws {
        let configuration = try XCTUnwrap(ErrorReporting.Configuration(info: info()))

        XCTAssertEqual(configuration.app, "fivvi")
        XCTAssertEqual(configuration.release, "app.fivvi@0.1.0+1")
    }

    func test_E017_AC10_theBuildOfThisAppNamesItselfFivvi() throws {
        let configuration = ErrorReporting.Configuration(info: Bundle.main.infoDictionary?.merging(
            [ErrorReporting.dsnKey: "https://public@o0.ingest.de.sentry.io/1"], uniquingKeysWith: { _, new in new }
        ))

        XCTAssertEqual(configuration?.app, "fivvi")
        XCTAssertEqual(configuration?.release.hasPrefix("app.fivvi@"), true)
    }

    func test_E017_AC10_anEventCarriesTheAppAndPlatformTagsAndNothingElse() throws {
        let sent = try sent(event())

        XCTAssertEqual(sent["tags"] as? [String: String], ["app": "fivvi", "platform": "ios"])
    }

    func test_E017_AC10_theScopeCannotChangeTheAppTag() throws {
        let sent = try sent(event())

        XCTAssertEqual((sent["tags"] as? [String: String])?["app"], "fivvi", "the event's own `app` tag was `other`")
    }

    func test_E017_AC10_noEmailNameWorkspaceNameOrTokenLeavesTheApp() throws {
        let sent = try sent(event())

        let json = try XCTUnwrap(String(bytes: JSONSerialization.data(withJSONObject: sent), encoding: .utf8))
        for value in [Synthetic.email, Synthetic.name, "Anna", "Vries", Synthetic.workspace, Synthetic.token] {
            XCTAssertFalse(json.contains(value), "\(value) left the app: \(json)")
        }
        XCTAssertEqual(
            sent["user"] as? NSDictionary,
            ["id": Synthetic.accountID, "data": ["organization_id": Synthetic.workspaceID]],
            "only the account and workspace IDs"
        )
    }

    func test_E017_AC10_anEventWithoutTagsStillCarriesTheAppTags() throws {
        let bare = Event(level: .error)

        XCTAssertEqual(try sent(bare)["tags"] as? [String: String], ["app": "fivvi", "platform": "ios"])
    }

    func test_E017_AC10_anAppWithoutAReportNameSetsNoTags() throws {
        // Fivvi Pro's Info.plist has no `FivviSentryApp`: its reports stay as they were.
        let sent = try sent(event(), app: nil)

        XCTAssertNil((sent["tags"] as? [String: String])?["app"])
        XCTAssertNil((sent["tags"] as? [String: String])?["platform"])
    }
}
