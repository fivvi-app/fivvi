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

    func recordWorkspaceSwitch(
        _ input: Operations.RecordWorkspaceSwitch.Input
    ) async throws -> Operations.RecordWorkspaceSwitch.Output {
        fatalError("The app doesn't call recordWorkspaceSwitch yet")
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

    func listTrainers(_ input: Operations.ListTrainers.Input) async throws -> Operations.ListTrainers.Output {
        fatalError("The app doesn't call listTrainers yet")
    }

    func listLocations(_ input: Operations.ListLocations.Input) async throws -> Operations.ListLocations.Output {
        fatalError("The app doesn't call listLocations yet")
    }

    func updateLocation(_ input: Operations.UpdateLocation.Input) async throws -> Operations.UpdateLocation.Output {
        fatalError("The app doesn't call updateLocation yet")
    }
}
