import Foundation
import Sentry
import XCTest

@testable import TrainerHub

/// Synthetic personal data for the E009 tests (AGENTS.md, D8). The client name, email address, IP address and UUIDs
/// are the same as in the Android `ObservabilityTest`.
enum Synthetic {
    static let clientName = "Femke de Vries"
    static let email = "femke@example.com"
    static let ipAddress = "203.0.113.7"
    static let token = "Bearer synthetic-token"
    static let cookie = "session=synthetic-cookie"
    static let userID = "0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f"
    static let workspaceID = "7d3e2a1b-8c9d-4e0f-a1b2-c3d4e5f6a7b8"
    static let clientID = "3f2e1d0c-9b8a-4765-8432-10fedcba9876"
    static let route = "/v1/clients/:clientId/notes"
    static let path = "/api/v1/clients/\(clientID)/notes"
    static let release = "nl.trainerhub.app@0.1.0+1"
    static let dsn = "https://public@o0.ingest.de.sentry.io/1"

    /// Note text in the language of the test-plan configuration.
    static var note: String {
        TestCatalog.configuredLocale == .nlNL
            ? "Knieblessure; één week rust, geen diepe squats"
            : "Knee injury, avoid deep squats"
    }

    /// Everything that must never leave the app.
    static var personalData: [String] {
        [
            clientName, "Femke", "Vries", email, "femke", note, String(note.prefix(4)), ipAddress, token,
            "synthetic-token", cookie, "synthetic-cookie", "Zwolle"
        ]
    }

    /// An Info.plist of a build configuration with this DSN.
    static func info(dsn: String) -> [String: Any] {
        [
            ErrorReporting.dsnKey: dsn,
            ErrorReporting.environmentKey: "production",
            "CFBundleIdentifier": "nl.trainerhub.app",
            "CFBundleShortVersionString": "0.1.0",
            "CFBundleVersion": "1"
        ]
    }

    /// An error event with personal data in every field that can hold it.
    static func event() -> Event {
        let event = Event(level: .error)
        event.environment = "production"
        event.releaseName = release
        event.transaction = "NotesView"
        event.serverName = "iPhone van \(clientName)"
        event.logger = "notes"
        event.message = SentryMessage(formatted: "Could not invite \(email)")
        event.message?.params = [clientName]
        event.exceptions = [exception()]
        event.threads = [crashedThread()]
        event.request = request()
        event.user = user()
        event.tags = ["route": route, "client_name": clientName]
        event.extra = ["note": note, "clientName": clientName]
        event.modules = ["Femke": "1.0"]
        event.context = [
            "os": ["name": "iOS", "version": "17.0"],
            "device": ["model": "iPhone17,1"],
            "response": ["status_code": 500, "headers": ["Set-Cookie": cookie]],
            "client": ["name": clientName, "note": note]
        ]
        let console = Breadcrumb(level: .info, category: "console")
        console.message = "Saving note for \(clientName): \(note)"
        let http = Breadcrumb(level: .info, category: "http")
        http.type = "http"
        http.message = "POST \(email)"
        setData(of: http, [
            "method": "POST", "url": "https://api.example.com/v1/notes?email=\(email)", "status_code": 201,
            "request_body": note, "recipient": clientName
        ])
        event.breadcrumbs = [console, http]
        // A watchdog-termination event carries the previous run's breadcrumbs as stored on disk, in a private field.
        event.setValue(
            [[
                "category": "console", "level": "info", "message": note,
                "data": ["client": clientName, "status_code": 500]
            ]],
            forKey: "serializedBreadcrumbs"
        )
        return event
    }

    static func setData(of breadcrumb: Breadcrumb, _ data: [String: Any]) {
        for (key, value) in data {
            breadcrumb.setData(value: value, key: key)
        }
    }

    /// The event as JSON, as it would leave the app.
    static func json(_ object: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes, .sortedKeys])
        return try XCTUnwrap(String(bytes: data, encoding: .utf8))
    }

    private static func exception() -> Exception {
        let mechanism = Mechanism(type: "NSException")
        mechanism.desc = "Rejected \(email)"
        mechanism.data = ["note": note]
        mechanism.handled = false
        let exception = Exception(value: "Duplicate key (email)=(\(email)) for client \(clientID)", type: "SaveError")
        exception.mechanism = mechanism
        exception.stacktrace = SentryStacktrace(
            frames: [frame(function: "saveNote", file: "NotesView.swift", line: 12)], registers: [:]
        )
        return exception
    }

    private static func crashedThread() -> SentryThread {
        let thread = SentryThread(threadId: 0)
        thread.crashed = true
        thread.current = true
        thread.isMain = true
        thread.stacktrace = SentryStacktrace(
            frames: [frame(function: "main", file: "TrainerHubApp.swift", line: 7)], registers: ["x0": "0x1"]
        )
        return thread
    }

    private static func request() -> SentryRequest {
        let request = SentryRequest()
        request.method = "POST"
        request.url = "https://app.example.com\(path)?email=\(email)#\(clientName)"
        request.queryString = "email=\(email)&name=\(clientName)"
        request.fragment = clientName
        request.cookies = cookie
        request.bodySize = 42
        request.headers = [
            "Authorization": token, "Cookie": cookie, "Content-Type": "application/json",
            "X-Forwarded-For": ipAddress, "X-Client-Name": clientName
        ]
        return request
    }

    private static func user() -> User {
        let user = User(userId: userID)
        user.email = email
        user.username = clientName
        user.name = clientName
        user.ipAddress = ipAddress
        user.geo = Geo()
        user.geo?.city = "Zwolle"
        user.data = ["organization_id": workspaceID, "client_name": clientName]
        return user
    }

    private static func frame(function: String, file: String, line: Int) -> Frame {
        let frame = Frame()
        frame.function = function
        frame.fileName = file
        frame.lineNumber = NSNumber(value: line)
        frame.vars = ["text": note, "name": clientName, "ip": ipAddress]
        return frame
    }
}
