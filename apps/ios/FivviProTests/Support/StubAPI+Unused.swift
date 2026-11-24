import FivviAPI

/// Operations the app doesn't call yet. In an extension of its own file so `StubAPI.swift` stays within SwiftLint's length limit.
extension StubAPI {
    func getHello(_ input: Operations.GetHello.Input) async throws -> Operations.GetHello.Output {
        fatalError("The app doesn't call getHello since the Hello screen went (E020, #652)")
    }

    func getHealth(_ input: Operations.GetHealth.Input) async throws -> Operations.GetHealth.Output {
        fatalError("The app doesn't call getHealth")
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

    func removeTeamMember(
        _ input: Operations.RemoveTeamMember.Input
    ) async throws -> Operations.RemoveTeamMember.Output {
        fatalError("The app doesn't call removeTeamMember yet")
    }

    func getTeamMemberFutureSessions(
        _ input: Operations.GetTeamMemberFutureSessions.Input
    ) async throws -> Operations.GetTeamMemberFutureSessions.Output {
        fatalError("The app doesn't call getTeamMemberFutureSessions yet")
    }

    func changeTeamMemberRole(
        _ input: Operations.ChangeTeamMemberRole.Input
    ) async throws -> Operations.ChangeTeamMemberRole.Output {
        fatalError("The app doesn't call changeTeamMemberRole yet")
    }

    func updateLocation(_ input: Operations.UpdateLocation.Input) async throws -> Operations.UpdateLocation.Output {
        fatalError("The app doesn't call updateLocation yet")
    }

    func requestEmailChange(
        _ input: Operations.RequestEmailChange.Input
    ) async throws -> Operations.RequestEmailChange.Output {
        fatalError("The app doesn't call requestEmailChange yet")
    }

    func confirmEmailChange(
        _ input: Operations.ConfirmEmailChange.Input
    ) async throws -> Operations.ConfirmEmailChange.Output {
        fatalError("The app doesn't call confirmEmailChange yet")
    }

    func getWorkspaceCalendar(
        _ input: Operations.GetWorkspaceCalendar.Input
    ) async throws -> Operations.GetWorkspaceCalendar.Output {
        fatalError("The app doesn't call getWorkspaceCalendar yet")
    }

    func lookupAddress(_ input: Operations.LookupAddress.Input) async throws -> Operations.LookupAddress.Output {
        fatalError("The app doesn't call lookupAddress yet")
    }

    func requestDemo(_ input: Operations.RequestDemo.Input) async throws -> Operations.RequestDemo.Output {
        fatalError("The app doesn't call requestDemo: it is the website's demo form")
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

    func listGroupClasses(
        _ input: Operations.ListGroupClasses.Input
    ) async throws -> Operations.ListGroupClasses.Output {
        fatalError("The app doesn't call listGroupClasses yet")
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

    func updateGroupClassSeries(
        _ input: Operations.UpdateGroupClassSeries.Input
    ) async throws -> Operations.UpdateGroupClassSeries.Output {
        fatalError("The app doesn't call updateGroupClassSeries yet")
    }

    func assignTrainer(
        _ input: Operations.AssignTrainer.Input
    ) async throws -> Operations.AssignTrainer.Output {
        fatalError("The app doesn't call assignTrainer yet")
    }

    func listTrainerCandidates(
        _ input: Operations.ListTrainerCandidates.Input
    ) async throws -> Operations.ListTrainerCandidates.Output {
        fatalError("The app doesn't call listTrainerCandidates yet")
    }

    func listGroupClassSeries(
        _ input: Operations.ListGroupClassSeries.Input
    ) async throws -> Operations.ListGroupClassSeries.Output {
        fatalError("The app doesn't call listGroupClassSeries yet")
    }

    func getKeptClassDates(
        _ input: Operations.GetKeptClassDates.Input
    ) async throws -> Operations.GetKeptClassDates.Output {
        fatalError("The app doesn't call getKeptClassDates yet")
    }

    func getJoinLink(_ input: Operations.GetJoinLink.Input) async throws -> Operations.GetJoinLink.Output {
        fatalError("The app doesn't call getJoinLink yet")
    }

    func listAccessLog(_ input: Operations.ListAccessLog.Input) async throws -> Operations.ListAccessLog.Output {
        fatalError("The app doesn't call listAccessLog yet")
    }

    func renewJoinLink(_ input: Operations.RenewJoinLink.Input) async throws -> Operations.RenewJoinLink.Output {
        fatalError("The app doesn't call renewJoinLink yet")
    }

    func listBookingLinks(
        _ input: Operations.ListBookingLinks.Input
    ) async throws -> Operations.ListBookingLinks.Output {
        fatalError("The app doesn't call listBookingLinks yet")
    }

    func deactivateBookingLink(
        _ input: Operations.DeactivateBookingLink.Input
    ) async throws -> Operations.DeactivateBookingLink.Output {
        fatalError("The app doesn't call deactivateBookingLink yet")
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

    func getInvoiceDetails(
        _ input: Operations.GetInvoiceDetails.Input
    ) async throws -> Operations.GetInvoiceDetails.Output {
        fatalError("The app doesn't call getInvoiceDetails yet")
    }

    func putInvoiceDetails(
        _ input: Operations.PutInvoiceDetails.Input
    ) async throws -> Operations.PutInvoiceDetails.Output {
        fatalError("The app doesn't call putInvoiceDetails yet")
    }

    func getClientBillingDetails(
        _ input: Operations.GetClientBillingDetails.Input
    ) async throws -> Operations.GetClientBillingDetails.Output {
        fatalError("The app doesn't call getClientBillingDetails yet")
    }

    func putClientBillingDetails(
        _ input: Operations.PutClientBillingDetails.Input
    ) async throws -> Operations.PutClientBillingDetails.Output {
        fatalError("The app doesn't call putClientBillingDetails yet")
    }

    func getMyBillingDetails(
        _ input: Operations.GetMyBillingDetails.Input
    ) async throws -> Operations.GetMyBillingDetails.Output {
        fatalError("The app doesn't call getMyBillingDetails yet")
    }

    func putMyBillingDetails(
        _ input: Operations.PutMyBillingDetails.Input
    ) async throws -> Operations.PutMyBillingDetails.Output {
        fatalError("The app doesn't call putMyBillingDetails yet")
    }

    func listOffers(
        _ input: Operations.ListOffers.Input
    ) async throws -> Operations.ListOffers.Output {
        fatalError("The app doesn't call listOffers yet")
    }

    func getOffer(
        _ input: Operations.GetOffer.Input
    ) async throws -> Operations.GetOffer.Output {
        fatalError("The app doesn't call getOffer yet")
    }

    func createOffer(
        _ input: Operations.CreateOffer.Input
    ) async throws -> Operations.CreateOffer.Output {
        fatalError("The app doesn't call createOffer yet")
    }

    func updateOffer(
        _ input: Operations.UpdateOffer.Input
    ) async throws -> Operations.UpdateOffer.Output {
        fatalError("The app doesn't call updateOffer yet")
    }

    func listSessionParticipants(
        _ input: Operations.ListSessionParticipants.Input
    ) async throws -> Operations.ListSessionParticipants.Output {
        fatalError("The app doesn't call listSessionParticipants yet")
    }

    func setParticipantAttendance(
        _ input: Operations.SetParticipantAttendance.Input
    ) async throws -> Operations.SetParticipantAttendance.Output {
        fatalError("The app doesn't call setParticipantAttendance yet")
    }

    func markEveryoneAttended(
        _ input: Operations.MarkEveryoneAttended.Input
    ) async throws -> Operations.MarkEveryoneAttended.Output {
        fatalError("The app doesn't call markEveryoneAttended yet")
    }
}
