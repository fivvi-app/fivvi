import Foundation
import FivviAPI

@testable import FivviPro

/// `GET /api/v1/workspaces/{id}/day` of the stub (F014): the day it holds, or the failure a test sets, and what the app
/// asked.
final class StubWorkspaceDay: @unchecked Sendable {
    enum Failure: Sendable {
        case offline, status(Int), forbidden
    }

    /// One request: the workspace and the date the app asked for.
    struct Request: Equatable, Sendable {
        let workspaceID: String
        let date: String?
    }

    private let lock = NSLock()
    private var held: Components.Schemas.WorkspaceDay?
    private var failure: Failure?
    private var asked: [Request] = []

    var requests: [Request] { lock.withLock { asked } }

    func serve(_ day: Components.Schemas.WorkspaceDay?) {
        lock.withLock { held = day }
    }

    func fail(_ failure: Failure?) {
        lock.withLock { self.failure = failure }
    }

    func answer(_ input: Operations.GetWorkspaceDay.Input) throws -> Operations.GetWorkspaceDay.Output {
        let (day, failure) = lock.withLock {
            asked.append(.init(workspaceID: input.path.workspaceId, date: input.query.date))
            return (held, self.failure)
        }
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case let .status(code): return .undocumented(statusCode: code, .init())
        case .forbidden: return .forbidden(.init(body: .json(.init(code: .forbidden))))
        case nil: break
        }
        guard let day else { return .undocumented(statusCode: 404, .init()) }
        return .ok(.init(body: .json(day)))
    }
}
