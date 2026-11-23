import Foundation
import FivviAPI

@testable import FivviPro

/// `GET /api/v1/me/sessions` of the stub (F013): the sessions it holds, cut to the days the app asked for as the API cuts
/// them (by the day in Dutch time), or the failure a test sets, and what the app asked.
final class StubMySessions: @unchecked Sendable {
    enum Failure: Sendable {
        case offline, status(Int)
    }

    private let lock = NSLock()
    private var held: [PersonalItem]?
    private var workspaceCount = 2
    private var failure: Failure?
    private var asked: [Operations.ListMySessions.Input.Query] = []

    /// The query of every call, in order.
    var queries: [Operations.ListMySessions.Input.Query] { lock.withLock { asked } }

    func serve(_ items: [PersonalItem]?, workspaceCount: Int = 2) {
        lock.withLock {
            held = items
            self.workspaceCount = workspaceCount
        }
    }

    func fail(_ failure: Failure?) {
        lock.withLock { self.failure = failure }
    }

    func answer(_ query: Operations.ListMySessions.Input.Query) throws -> Operations.ListMySessions.Output {
        let (items, count, failure) = lock.withLock {
            asked.append(query)
            return (held, workspaceCount, self.failure)
        }
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case let .status(code): return .undocumented(statusCode: code, .init())
        case nil: break
        }
        guard let items else { return .undocumented(statusCode: 404, .init()) }
        let zone = PersonalRows.timeZone
        let inRange = items.filter {
            let day = SessionClock.localDate($0.startsAt, in: zone)
            return day >= query.from && day <= query.to
        }
        return .ok(.init(body: .json(.init(
            from: query.from, to: query.to, timeZone: "Europe/Amsterdam", workspaceCount: count,
            items: inRange.sorted { $0.startsAt < $1.startsAt }
        ))))
    }
}
