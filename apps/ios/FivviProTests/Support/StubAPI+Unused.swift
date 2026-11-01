import FivviAPI

/// Operations the app doesn't call yet. In an extension of its own file so `StubAPI.swift` stays within SwiftLint's length limit.
extension StubAPI {
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

    func putTrainerProfile(
        _ input: Operations.PutTrainerProfile.Input
    ) async throws -> Operations.PutTrainerProfile.Output {
        fatalError("The app doesn't call putTrainerProfile yet")
    }

    func deleteTrainerProfile(
        _ input: Operations.DeleteTrainerProfile.Input
    ) async throws -> Operations.DeleteTrainerProfile.Output {
        fatalError("The app doesn't call deleteTrainerProfile yet")
    }
}
