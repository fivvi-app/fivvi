import FivviAPI
import OpenAPIRuntime
import XCTest

@testable import FivviPro

/// The API writes every instant as JavaScript does, with milliseconds (`2026-11-19T08:00:00.000Z`); the generated client's
/// default reads none (F020: a session's start and end).
final class APIDatesTests: XCTestCase {
    private let session = """
    {"id":"8a0b1c2e-8a54-4b51-9a42-000000000001","type":"private","status":"scheduled",
     "startsAt":"2026-11-19T08:00:00.000Z","endsAt":"2026-11-19T09:00:00.000Z","timeZone":"Europe/Amsterdam",
     "capacity":1,"version":1,
     "location":{"id":"6d1c2d3e-0000-4000-8000-0000000000b1","name":"John's Gym","type":"organization_location",
                 "address":null,"isDefault":true},
     "participants":[]}
    """

    func test_F020_theAppsClientReadsTheInstantsTheAPIWrites() async throws {
        let transport = StubTransport(json: session)
        let api = Client(
            serverURL: URL(string: "https://example.com/api")!, configuration: AppConfiguration.clientConfiguration,
            transport: transport
        )

        let output = try await api.getSession(.init(path: .init(workspaceId: "w", sessionId: "s")))

        let found = try output.ok.body.json
        XCTAssertEqual(found.startsAt, Date(timeIntervalSince1970: 1_795_075_200), "08:00 UTC on 19 November 2026")
        XCTAssertEqual(found.endsAt.timeIntervalSince(found.startsAt), 3_600)
    }
}
