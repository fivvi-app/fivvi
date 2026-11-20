import Foundation
import FivviAPI

/// Why a read the session screens need didn't give its answer.
enum SessionLoadError: Error, Equatable {
    /// The API answered `403` or `404`: the person has no access to this (any more), or it is gone.
    case gone
    /// The API couldn't be reached.
    case offline
    /// Any other answer.
    case failed

    init(thrown error: any Error) {
        switch ClientRequestError(thrown: error) {
        case .offline: self = .offline
        default: self = .failed
        }
    }
}

/// The trainers of the workspace and who of them the person is: the trainer whose ID is the person's own team-member ID
/// (`CurrentWorkspace.teamMemberId`, from `GET /api/v1/me`). Never found by address or name.
enum SessionTeam {
    typealias Trainer = Components.Schemas.Trainer

    /// The team-member ID of the person when it is among `trainers` (an Owner who doesn't train is not), else nil.
    static func myTrainerID(trainers: [Trainer], teamMemberID: String) -> String? {
        trainers.first { $0.id == teamMemberID }?.id
    }

    /// `GET …/trainers`.
    static func readTrainers(api: any APIProtocol, workspaceID: String) async throws(SessionLoadError) -> [Trainer] {
        do {
            switch try await api.listTrainers(.init(path: .init(workspaceId: workspaceID))) {
            case let .ok(found): return try found.body.json
            case .forbidden, .notFound: throw SessionLoadError.gone
            default: throw SessionLoadError.failed
            }
        } catch let error as SessionLoadError {
            throw error
        } catch {
            throw SessionLoadError(thrown: error)
        }
    }
}
