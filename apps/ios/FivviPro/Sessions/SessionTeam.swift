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

/// The trainers of the workspace and who of them the person is. The API has no "me" on a trainer: the Owner reads the
/// team (`team.view`) and finds their own place by the address they sign in with, as the web does; a Trainer can't read
/// the team, so their name finds them among the trainers, and only when no other trainer has the same name.
enum SessionTeam {
    typealias Trainer = Components.Schemas.Trainer
    typealias Member = Components.Schemas.TeamMember

    /// The team-member ID of the person among `trainers`, or nil when they can't be told.
    static func myTrainerID(trainers: [Trainer], members: [Member]?, email: String, name: String?) -> String? {
        if let members {
            let mine = members.first { $0.email.lowercased() == email.lowercased() }
            return trainers.first { $0.id == mine?.id }?.id
        }
        guard let name, !name.isEmpty else { return nil }
        let same = trainers.filter { $0.name == name }
        return same.count == 1 ? same.first?.id : nil
    }

    /// `GET …/trainers`, and with `readTeam` `GET …/team-members` too (a courtesy: without it the person is found by
    /// name).
    static func read(
        api: any APIProtocol, workspaceID: String, readTeam: Bool
    ) async throws(SessionLoadError) -> (trainers: [Trainer], members: [Member]?) {
        let trainers: [Trainer]
        do {
            switch try await api.listTrainers(.init(path: .init(workspaceId: workspaceID))) {
            case let .ok(found): trainers = try found.body.json
            case .forbidden, .notFound: throw SessionLoadError.gone
            default: throw SessionLoadError.failed
            }
        } catch let error as SessionLoadError {
            throw error
        } catch {
            throw SessionLoadError(thrown: error)
        }
        guard readTeam, let team = try? await api.listTeamMembers(.init(path: .init(workspaceId: workspaceID))),
              case let .ok(found) = team, let members = try? found.body.json
        else { return (trainers, nil) }
        return (trainers, members)
    }
}
