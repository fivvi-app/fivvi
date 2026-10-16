import Sentry
import XCTest

@testable import TrainerHub

/// E009 AC8: what the app would send to Sentry. The tests feed synthetic personal data (`Synthetic`) through the
/// scrubber and check the serialized event, which is what leaves the process (docs/engineering/OBSERVABILITY.md §6.1).
final class ObservabilityTests: XCTestCase {
    func test_E009_AC8_beforeSendScrubsPersonalData() throws {
        let sent = try XCTUnwrap(ErrorReporting.beforeSend(Synthetic.event())).serialize()

        let json = try Synthetic.json(sent)
        for value in Synthetic.personalData {
            XCTAssertFalse(json.contains(value), "\(value) left the process: \(json)")
        }
        XCTAssertEqual(
            Set(sent.keys),
            [
                "event_id", "timestamp", "platform", "level", "logger", "environment", "release", "transaction",
                "message", "exception", "threads", "request", "user", "tags", "contexts", "breadcrumbs"
            ]
        )
        XCTAssertEqual(sent["logger"] as? String, "notes")
        XCTAssertEqual(sent["environment"] as? String, "production")
        XCTAssertEqual(sent["release"] as? String, Synthetic.release)
        XCTAssertEqual(sent["transaction"] as? String, "NotesView")
        XCTAssertEqual((sent["message"] as? [String: Any])?["formatted"] as? String, "Could not invite [email]")
        XCTAssertEqual(
            sent["request"] as? NSDictionary,
            [
                "method": "POST",
                "url": "https://app.example.com\(Synthetic.path)",
                "headers": ["content-type": "application/json"]
            ]
        )
        XCTAssertEqual(
            sent["user"] as? NSDictionary, ["id": Synthetic.userID, "data": ["organization_id": Synthetic.workspaceID]]
        )
        XCTAssertEqual(sent["tags"] as? [String: String], ["route": Synthetic.route])
        XCTAssertEqual(
            sent["contexts"] as? NSDictionary,
            [
                "os": ["name": "iOS", "version": "17.0"],
                "device": ["model": "iPhone17,1"],
                "response": ["status_code": 500]
            ]
        )
        XCTAssertEqual(
            (sent["breadcrumbs"] as? [[String: Any]])?.map(Self.withoutTimestamp),
            [
                ["category": "console", "level": "info"],
                [
                    "type": "http", "category": "http", "level": "info",
                    "data": ["method": "POST", "url": "https://api.example.com/v1/notes", "status_code": 201]
                ]
            ]
        )
    }

    func test_E009_AC8_beforeSendKeepsTheStackTraces() throws {
        let sent = try XCTUnwrap(ErrorReporting.beforeSend(Synthetic.event())).serialize()

        let exception = try XCTUnwrap(Self.values(sent["exception"]).first)
        XCTAssertEqual(exception["type"] as? String, "SaveError")
        XCTAssertEqual(
            exception["value"] as? String, "Duplicate key (email)=([email]) for client \(Synthetic.clientID)"
        )
        let mechanism = try XCTUnwrap(exception["mechanism"] as? [String: Any])
        XCTAssertEqual(mechanism["type"] as? String, "NSException")
        XCTAssertEqual(mechanism["description"] as? String, "Rejected [email]")
        XCTAssertEqual(mechanism["handled"] as? Bool, false)
        XCTAssertNil(mechanism["data"])
        XCTAssertEqual(
            try Self.frames(exception), [["function": "saveNote", "filename": "NotesView.swift", "lineno": 12]]
        )

        let thread = try XCTUnwrap(Self.values(sent["threads"]).first)
        XCTAssertEqual(thread["crashed"] as? Bool, true)
        XCTAssertEqual(thread["main"] as? Bool, true)
        XCTAssertEqual(try Self.frames(thread), [["function": "main", "filename": "TrainerHubApp.swift", "lineno": 7]])
        XCTAssertEqual((thread["stacktrace"] as? [String: Any])?["registers"] as? [String: String], ["x0": "0x1"])
    }

    func test_E009_AC8_keepsOnlyUUIDsInTheUser() throws {
        let event = Synthetic.event()
        event.user = User(userId: Synthetic.email)
        event.user?.data = ["organization_id": Synthetic.clientName]

        XCTAssertNil(try XCTUnwrap(ErrorReporting.beforeSend(event)).user)
    }

    func test_E009_AC8_masksEmailAddressesInTheURLPath() throws {
        let event = Synthetic.event()
        event.request?.url = "/api/v1/invitations/femke%40example.com"

        let request = try XCTUnwrap(ErrorReporting.beforeSend(event)?.request)

        XCTAssertEqual(request.url, "/api/v1/invitations/[email]")
    }

    func test_E009_AC8_breadcrumbsKeepTheHTTPMethodStatusCodeAndURLPathOnly() throws {
        let breadcrumb = Breadcrumb(level: .info, category: "http")
        breadcrumb.type = "http"
        breadcrumb.origin = "auto.http.urlsession"
        breadcrumb.message = "POST \(Synthetic.email)"
        Synthetic.setData(of: breadcrumb, [
            "method": "POST",
            "url": "https://api.example.com/v1/clients?email=\(Synthetic.email)#\(Synthetic.clientName)",
            "status_code": 201,
            "request_body": Synthetic.note,
            "recipient": Synthetic.clientName
        ])

        let scrubbed = try XCTUnwrap(ErrorReporting.beforeBreadcrumb(breadcrumb)).serialize()

        XCTAssertEqual(
            Self.withoutTimestamp(scrubbed),
            [
                "type": "http", "category": "http", "level": "info",
                "data": ["method": "POST", "url": "https://api.example.com/v1/clients", "status_code": 201]
            ]
        )
    }

    func test_E009_AC8_disabledWithoutDSN() {
        XCTAssertEqual(
            SentrySDK.isEnabled, ErrorReporting.Configuration(info: Bundle.main.infoDictionary) != nil,
            "the app starts error reporting only when its build configuration has a DSN"
        )
        // A developer's Config/Local.xcconfig may set a DSN; start from a stopped SDK either way.
        SentrySDK.close()

        for dsn in [nil, "", "  "] {
            var info = Synthetic.info(dsn: "unused")
            info[ErrorReporting.dsnKey] = dsn

            XCTAssertNil(ErrorReporting.Configuration(info: info), "DSN \(String(describing: dsn))")
            XCTAssertFalse(ErrorReporting.start(info: info), "DSN \(String(describing: dsn))")
            XCTAssertFalse(SentrySDK.isEnabled, "DSN \(String(describing: dsn))")
        }
    }

    func test_E009_AC8_eventsCarryEnvironmentAndReleaseWithSessionTracking() throws {
        XCTAssertEqual(
            Bundle.main.object(forInfoDictionaryKey: ErrorReporting.environmentKey) as? String, "development",
            "Debug builds report as development"
        )
        let configuration = try XCTUnwrap(ErrorReporting.Configuration(info: Synthetic.info(dsn: Synthetic.dsn)))

        let options = ErrorReporting.options(for: configuration)

        XCTAssertEqual(options.dsn, Synthetic.dsn)
        XCTAssertEqual(options.environment, "production")
        XCTAssertEqual(options.releaseName, Synthetic.release)
        XCTAssertTrue(options.enableAutoSessionTracking, "crash-free sessions")
        XCTAssertTrue(options.enableCrashHandler)
        XCTAssertFalse(options.sendDefaultPii)
        XCTAssertFalse(options.isTracingEnabled)
        XCTAssertFalse(options.enableAutoPerformanceTracing)
        XCTAssertEqual(options.sessionReplay.sessionSampleRate, 0)
        XCTAssertEqual(options.sessionReplay.onErrorSampleRate, 0)
        XCTAssertFalse(options.attachScreenshot)
        XCTAssertFalse(options.attachViewHierarchy)
        XCTAssertFalse(options.enableCaptureFailedRequests)
        XCTAssertFalse(options.enableLogs)
        XCTAssertFalse(options.sendClientReports)
        let event = try XCTUnwrap(options.beforeSend?(Synthetic.event()))
        XCTAssertFalse(try Synthetic.json(event.serialize()).contains(Synthetic.email), "beforeSend is the scrubber")
        let breadcrumb = Breadcrumb(level: .info, category: "console")
        breadcrumb.message = Synthetic.note
        XCTAssertNil(options.beforeBreadcrumb?(breadcrumb)?.message, "beforeBreadcrumb is the scrubber")
    }

    private static func withoutTimestamp(_ breadcrumb: [String: Any]) -> NSDictionary {
        breadcrumb.filter { $0.key != "timestamp" } as NSDictionary
    }

    private static func values(_ list: Any?) throws -> [[String: Any]] {
        try XCTUnwrap((list as? [String: Any])?["values"] as? [[String: Any]])
    }

    private static func frames(_ owner: [String: Any]) throws -> [NSDictionary] {
        let stacktrace = try XCTUnwrap(owner["stacktrace"] as? [String: Any])
        return try XCTUnwrap(stacktrace["frames"] as? [[String: Any]]).map {
            $0.filter { ["function", "filename", "lineno", "vars"].contains($0.key) } as NSDictionary
        }
    }
}
