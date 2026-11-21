import Foundation
import FivviAPI

@testable import FivviPro

/// `GET /api/v1/me/day` of the stub: the day it holds, or the failure a test sets, and what the app asked.
final class StubMyDay: @unchecked Sendable {
    enum Failure: Sendable {
        case offline, status(Int)
    }

    private let lock = NSLock()
    private var held: PersonalDay?
    private var failure: Failure?
    private var asked: [Operations.GetMyDay.Input.Query] = []

    /// The query of every call, in order.
    var queries: [Operations.GetMyDay.Input.Query] { lock.withLock { asked } }

    func serve(_ day: PersonalDay?) {
        lock.withLock { held = day }
    }

    func fail(_ failure: Failure?) {
        lock.withLock { self.failure = failure }
    }

    func answer(_ query: Operations.GetMyDay.Input.Query) throws -> Operations.GetMyDay.Output {
        let (day, failure) = lock.withLock {
            asked.append(query)
            return (held, self.failure)
        }
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case let .status(code): return .undocumented(statusCode: code, .init())
        case nil: break
        }
        guard let day else { return .undocumented(statusCode: 404, .init()) }
        return .ok(.init(body: .json(day)))
    }
}

/// Memory for the personal store: what a phone would keep in its file.
final class MemoryPersonalStore: PersonalStore, @unchecked Sendable {
    private let lock = NSLock()
    private var files: [String: Data] = [:]

    func read(_ name: String) -> Data? { lock.withLock { files[name] } }
    func write(_ data: Data, as name: String) { lock.withLock { files[name] = data } }
    func clear() { lock.withLock { files = [:] } }
}
