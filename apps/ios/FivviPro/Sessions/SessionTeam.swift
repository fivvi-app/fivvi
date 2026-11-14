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

    struct Team {
        let trainers: [Trainer]
        /// Nil when the team wasn't asked for or its read failed.
        let members: [Member]?
        let teamRequested: Bool
    }

    /// The team-member ID of the person among `trainers`, or nil when they can't be told. `teamRequested` says the
    /// person may read the team: when that read then failed (`members` is nil), they aren't told by name either, as a
    /// namesake could be taken for them.
    static func myTrainerID(
        trainers: [Trainer], members: [Member]?, teamRequested: Bool = false, email: String, name: String?
    ) -> String? {
        if let members {
            let mine = members.first { $0.email.lowercased() == email.lowercased() }
            return trainers.first { $0.id == mine?.id }?.id
        }
        guard !teamRequested else { return nil }
        guard let name, !name.isEmpty else { return nil }
        let same = trainers.filter { $0.name == name }
        return same.count == 1 ? same.first?.id : nil
    }

    /// `GET …/trainers`, and with `readTeam` `GET …/team-members` too (`teamRequested` then says so, whether or not
    /// the read gave `members`).
    static func read(
        api: any APIProtocol, workspaceID: String, readTeam: Bool
    ) async throws(SessionLoadError) -> Team {
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
        guard readTeam else { return Team(trainers: trainers, members: nil, teamRequested: false) }
        guard let team = try? await api.listTeamMembers(.init(path: .init(workspaceId: workspaceID))),
              case let .ok(found) = team, let members = try? found.body.json
        else { return Team(trainers: trainers, members: nil, teamRequested: true) }
        return Team(trainers: trainers, members: members, teamRequested: true)
    }
}
