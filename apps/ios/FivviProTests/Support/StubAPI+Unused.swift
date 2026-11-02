import FivviAPI

/// Operations the app doesn't call yet. In an extension of its own file so `StubAPI.swift` stays within SwiftLint's length limit.
extension StubAPI {
    func getHealth(_ input: Operations.GetHealth.Input) async throws -> Operations.GetHealth.Output {
        fatalError("The hello screen doesn't call getHealth")
    }

    func createWorkspace(_ input: Operations.CreateWorkspace.Input) async throws -> Operations.CreateWorkspace.Output {
        fatalError("The app doesn't call createWorkspace yet")
    }

    func renameWorkspace(_ input: Operations.RenameWorkspace.Input) async throws -> Operations.RenameWorkspace.Output {
        fatalError("The app doesn't call renameWorkspace yet")
    }

    func listTeamMembers(_ input: Operations.ListTeamMembers.Input) async throws -> Operations.ListTeamMembers.Output {
        fatalError("The app doesn't call listTeamMembers yet")
    }

    func removeTeamMember(
        _ input: Operations.RemoveTeamMember.Input
    ) async throws -> Operations.RemoveTeamMember.Output {
        fatalError("The app doesn't call removeTeamMember yet")
    }

    func changeTeamMemberRole(
        _ input: Operations.ChangeTeamMemberRole.Input
    ) async throws -> Operations.ChangeTeamMemberRole.Output {
        fatalError("The app doesn't call changeTeamMemberRole yet")
    }

    func listClients(_ input: Operations.ListClients.Input) async throws -> Operations.ListClients.Output {
        fatalError("The app doesn't call listClients yet")
    }

    func addClient(_ input: Operations.AddClient.Input) async throws -> Operations.AddClient.Output {
        fatalError("The app doesn't call addClient yet")
    }

    func getClient(_ input: Operations.GetClient.Input) async throws -> Operations.GetClient.Output {
        fatalError("The app doesn't call getClient yet")
    }

    func updateClient(_ input: Operations.UpdateClient.Input) async throws -> Operations.UpdateClient.Output {
        fatalError("The app doesn't call updateClient yet")
    }

    func listTrainers(_ input: Operations.ListTrainers.Input) async throws -> Operations.ListTrainers.Output {
        fatalError("The app doesn't call listTrainers yet")
    }
}
