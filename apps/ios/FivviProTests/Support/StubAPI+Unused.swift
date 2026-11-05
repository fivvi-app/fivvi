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

    func lookupAddress(_ input: Operations.LookupAddress.Input) async throws -> Operations.LookupAddress.Output {
        fatalError("The app doesn't call lookupAddress yet")
    }

    func createTrainerInvitation(
        _ input: Operations.CreateTrainerInvitation.Input
    ) async throws -> Operations.CreateTrainerInvitation.Output {
        fatalError("The app doesn't call createTrainerInvitation yet")
    }

    func listTrainerInvitations(
        _ input: Operations.ListTrainerInvitations.Input
    ) async throws -> Operations.ListTrainerInvitations.Output {
        fatalError("The app doesn't call listTrainerInvitations yet")
    }

    func resendTrainerInvitation(
        _ input: Operations.ResendTrainerInvitation.Input
    ) async throws -> Operations.ResendTrainerInvitation.Output {
        fatalError("The app doesn't call resendTrainerInvitation yet")
    }

    func withdrawTrainerInvitation(
        _ input: Operations.WithdrawTrainerInvitation.Input
    ) async throws -> Operations.WithdrawTrainerInvitation.Output {
        fatalError("The app doesn't call withdrawTrainerInvitation yet")
    }

    func createPrivateSession(
        _ input: Operations.CreatePrivateSession.Input
    ) async throws -> Operations.CreatePrivateSession.Output {
        fatalError("The app doesn't call createPrivateSession yet")
    }

    func getSession(
        _ input: Operations.GetSession.Input
    ) async throws -> Operations.GetSession.Output {
        fatalError("The app doesn't call getSession yet")
    }

    func listGroupClasses(
        _ input: Operations.ListGroupClasses.Input
    ) async throws -> Operations.ListGroupClasses.Output {
        fatalError("The app doesn't call listGroupClasses yet")
    }

    func createGroupClass(
        _ input: Operations.CreateGroupClass.Input
    ) async throws -> Operations.CreateGroupClass.Output {
        fatalError("The app doesn't call createGroupClass yet")
    }

    func getGroupClass(
        _ input: Operations.GetGroupClass.Input
    ) async throws -> Operations.GetGroupClass.Output {
        fatalError("The app doesn't call getGroupClass yet")
    }

    func updateGroupClass(
        _ input: Operations.UpdateGroupClass.Input
    ) async throws -> Operations.UpdateGroupClass.Output {
        fatalError("The app doesn't call updateGroupClass yet")
    }

    func scheduleGroupClassDate(
        _ input: Operations.ScheduleGroupClassDate.Input
    ) async throws -> Operations.ScheduleGroupClassDate.Output {
        fatalError("The app doesn't call scheduleGroupClassDate yet")
    }

    func updateGroupClassDate(
        _ input: Operations.UpdateGroupClassDate.Input
    ) async throws -> Operations.UpdateGroupClassDate.Output {
        fatalError("The app doesn't call updateGroupClassDate yet")
    }

    func getInvitation(
        _ input: Operations.GetInvitation.Input
    ) async throws -> Operations.GetInvitation.Output {
        fatalError("The app doesn't call getInvitation yet")
    }

    func acceptInvitation(
        _ input: Operations.AcceptInvitation.Input
    ) async throws -> Operations.AcceptInvitation.Output {
        fatalError("The app doesn't call acceptInvitation yet")
    }

    func declineInvitation(
        _ input: Operations.DeclineInvitation.Input
    ) async throws -> Operations.DeclineInvitation.Output {
        fatalError("The app doesn't call declineInvitation yet")
    }
}
