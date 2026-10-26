import Sentry
import XCTest

@testable import FivviPro

/// F001 AC12: what a failed sign-in reports to Sentry, through the scrubber (`ErrorReporting.beforeSend`).
final class ObservabilitySignInTests: XCTestCase {
    /// F001 AC12: a failed sign-in call reaches Sentry with neither the email field, the `Authorization` header, the
    /// code nor the token: the request keeps its method, path and a few harmless headers; the address is masked in
    /// what the error says; the breadcrumbs of the sign-in screen (a tap on the email field, the HTTP calls) keep
    /// only the method, status and path.
    func test_F001N_AC12_scrubsAuthorizationAndCode() throws {
        let event = Self.failedSignInEvent()
        let sent = try XCTUnwrap(ErrorReporting.beforeSend(event)).serialize()

        let json = try Synthetic.json(sent)
        for value in [Self.address, "owner", Self.code, Self.token, "Bearer", "signIn.email"] {
            XCTAssertFalse(json.contains(value), "\(value) left the process: \(json)")
        }
        XCTAssertEqual(
            sent["request"] as? NSDictionary,
            [
                "method": "POST", "url": "https://app.example.com/api/v1/sign-in/token",
                "headers": ["content-type": "application/json"]
            ]
        )
        XCTAssertEqual((sent["message"] as? [String: Any])?["formatted"] as? String, "Sign-in failed for [email]")
        XCTAssertEqual(
            (sent["breadcrumbs"] as? [[String: Any]])?.map(ObservabilityTests.withoutTimestamp),
            [
                ["type": "user", "category": "ui.click", "level": "info"],
                [
                    "type": "http", "category": "http", "level": "info",
                    "data": [
                        "method": "POST", "url": "https://app.example.com/api/v1/sign-in/token", "status_code": 401
                    ]
                ]
            ]
        )
    }

    private static let address = "owner@example.com"
    private static let code = "493817"
    private static let token = "bearer-token-0a1b2c3d4e5f"

    /// What Sentry would hold after a refused code: the request with its headers, the taps and calls before it, and
    /// everything an SDK or an app could attach, with the email field, the code and the token in each.
    private static func failedSignInEvent() -> Event {
        let event = Event(level: .error)
        event.message = SentryMessage(formatted: "Sign-in failed for \(address)")
        let request = SentryRequest()
        request.method = "POST"
        request.url = "https://app.example.com/api/v1/sign-in/token?email=\(address)&code=\(code)"
        request.queryString = "email=\(address)&code=\(code)"
        request.cookies = "session=\(token)"
        request.headers = [
            "Authorization": "Bearer \(token)", "authorization": "Bearer \(token)", "Content-Type": "application/json"
        ]
        event.request = request
        let tap = Breadcrumb(level: .info, category: "ui.click")
        tap.type = "user"
        tap.message = "signIn.email"
        Synthetic.setData(of: tap, [
            "view.accessibilityIdentifier": "signIn.email", "view.title": address, "view.value": address, "text": code
        ])
        let call = Breadcrumb(level: .info, category: "http")
        call.type = "http"
        Synthetic.setData(of: call, [
            "method": "POST", "url": "https://app.example.com/api/v1/sign-in/token?code=\(code)", "status_code": 401,
            "request_headers": "Authorization: Bearer \(token)"
        ])
        event.breadcrumbs = [tap, call]
        event.extra = ["email": address, "code": code, "token": token]
        event.user = User(userId: Synthetic.userID)
        event.user?.email = address
        return event
    }
}
