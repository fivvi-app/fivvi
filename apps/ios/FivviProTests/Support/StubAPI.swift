import Foundation
import OpenAPIRuntime
import FivviAPI

/// A stub of the generated client's `APIProtocol`, the view models' test seam (#34). It records what it was asked.
actor StubAPI: APIProtocol {
    enum Answer: Sendable {
        case greeting(key: String)
        case status(Int)
        case offline
    }

    /// What `requestSignIn` answers.
    enum SignInAnswer: Sendable {
        case accepted
        case badRequest
        case status(Int)
        case offline
    }

    /// What `exchangeSignInCode` answers.
    enum ExchangeAnswer: Sendable {
        case token(String)
        case unauthorized
        case badRequest
        case status(Int)
        case offline
    }

    /// The ID `getMe` answers with unless a test gives another (synthetic).
    static let accountID = "2f6a1f0e-0000-4000-8000-000000000001"

    /// What `getMe` answers.
    enum MeAnswer: Sendable {
        case account(
            email: String, id: String = StubAPI.accountID, workspaces: [String] = [], canCreateWorkspace: Bool = false,
            preferredLocale: Components.Schemas.Locale? = nil
        )
        case unauthorized
        case status(Int)
        case offline
        /// No answer until the test calls `releaseHangingMes()`, then the account of `StubAPI.accountID`.
        case hang
        /// Like `hang`, and the account then tells this stored preference (the answer to a read that went out earlier).
        case hangThenTelling(Components.Schemas.Locale)
    }

    /// A team role in a workspace, as `listMyWorkspaces` lists it (synthetic IDs).
    struct Membership: Sendable {
        let workspaceID: String
        let name: String
        let slug: String
        let role: Components.Schemas.MyWorkspace.RolePayload
    }

    /// What `listMyWorkspaces` answers.
    enum MyWorkspacesAnswer: Sendable {
        case workspaces([Membership])
        case unauthorized
        case status(Int)
        case offline
    }

    /// What `updateMe` answers.
    enum UpdateMeAnswer: Sendable {
        case accepted
        case status(Int)
        case offline
    }

    /// What `signOut` answers.
    enum SignOutAnswer: Sendable {
        case noContent
        case unauthorized
        case status(Int)
        case offline
        /// No answer until the test calls `releaseHangingSignOuts()`, as a connection that hangs.
        case hang
    }

    private var answer: Answer
    private var signOutAnswer = SignOutAnswer.noContent
    private var signInAnswer = SignInAnswer.accepted
    private var exchangeAnswer = ExchangeAnswer.unauthorized
    private var meAnswer = MeAnswer.unauthorized
    private var myWorkspacesAnswer = MyWorkspacesAnswer.workspaces([])
    private var updateMeAnswer = UpdateMeAnswer.accepted
    private var goneWorkspaces: Set<String> = []
    private var workspaceStatus: Int?
    private(set) var requestedLocales: [Components.Schemas.Locale?] = []
    /// The bodies of every `requestSignIn`, `exchangeSignInCode` and the number of `getMe` calls so far.
    private(set) var signInRequests: [Components.Schemas.SignInRequest] = []
    private(set) var exchanges: [Components.Schemas.SignInTokenRequest] = []
    private(set) var meCalls = 0
    /// The `preferredLocale` of every `updateMe`, in order.
    private(set) var savedLocales: [Components.Schemas.Locale?] = []
    /// The `surface` of every `updateMe`, in order.
    private(set) var savedSurfaces: [Components.Schemas.UpdateMeRequest.SurfacePayload?] = []
    private(set) var myWorkspacesCalls = 0
    /// The IDs `getWorkspace` was asked for, in order.
    private(set) var requestedWorkspaces: [String] = []
    private(set) var signOutCalls = 0
    private var hanging: [CheckedContinuation<Void, Never>] = []
    private var hangWatchers: [CheckedContinuation<Void, Never>] = []
    private var hangingMes: [CheckedContinuation<Void, Never>] = []
    private var hangingMeWatchers: [CheckedContinuation<Void, Never>] = []

    /// How many `signOut` calls are waiting for `releaseHangingSignOuts()`.
    var hangingSignOuts: Int { hanging.count }

    init(_ answer: Answer = .offline) {
        self.answer = answer
    }

    func answerSignIn(with answer: SignInAnswer) {
        signInAnswer = answer
    }

    func answerExchange(with answer: ExchangeAnswer) {
        exchangeAnswer = answer
    }

    func answerSignOut(with answer: SignOutAnswer) {
        signOutAnswer = answer
    }

    /// Returns once a `signOut` call hangs.
    func untilSignOutHangs() async {
        guard hanging.isEmpty else { return }
        await withCheckedContinuation { hangWatchers.append($0) }
    }

    /// Lets every hanging `signOut` answer `204`.
    func releaseHangingSignOuts() {
        let waiting = hanging
        hanging = []
        waiting.forEach { $0.resume() }
    }

    /// Returns once a `getMe` call hangs.
    func untilMeHangs() async {
        guard hangingMes.isEmpty else { return }
        await withCheckedContinuation { hangingMeWatchers.append($0) }
    }

    /// Lets every hanging `getMe` answer with the account.
    func releaseHangingMes() {
        let waiting = hangingMes
        hangingMes = []
        waiting.forEach { $0.resume() }
    }

    func answerMyWorkspaces(with answer: MyWorkspacesAnswer) {
        myWorkspacesAnswer = answer
    }

    /// From now on `getWorkspace` answers `404` for the workspace, as the API does once the account has lost its team
    /// access (F003 AC6).
    func removeFromTeam(of workspaceID: String) {
        goneWorkspaces.insert(workspaceID)
    }

    /// From now on `getWorkspace` answers this status (without a body) for every workspace.
    func answerWorkspace(withStatus status: Int) {
        workspaceStatus = status
    }

    func answerMe(with answer: MeAnswer) {
        meAnswer = answer
    }

    func answer(with answer: Answer) {
        self.answer = answer
    }

    func getHello(_ input: Operations.GetHello.Input) async throws -> Operations.GetHello.Output {
        requestedLocales.append(input.query.locale)
        switch answer {
        case let .greeting(key):
            return .ok(.init(body: .json(.init(greetingKey: key, locale: input.query.locale ?? .en))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

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

    /// The account `getMe` answers with: a workspace of each name in `workspaces` (synthetic IDs and slugs).
    private static func me(
        id: String, email: String, workspaces: [String] = [], canCreateWorkspace: Bool = false,
        preferredLocale: Components.Schemas.Locale? = nil
    ) -> Components.Schemas.MeResponse {
        .init(
            id: id, email: email, name: "Owner",
            preferredLocale: preferredLocale.flatMap { .init(rawValue: $0.rawValue) },
            canCreateWorkspace: canCreateWorkspace,
            workspaces: workspaces.enumerated().map { index, name in
                .init(
                    id: "7c1d2e3f-0000-4000-8000-00000000000\(index)", name: name,
                    slug: "workspace-\(index)", role: .owner,
                    capabilities: Components.Schemas.MeWorkspace.CapabilitiesPayloadPayload.allCases
                )
            }
        )
    }

    func getMe(_ input: Operations.GetMe.Input) async throws -> Operations.GetMe.Output {
        meCalls += 1
        let asked = meAnswer
        switch asked {
        case let .account(email, id, workspaces, canCreateWorkspace, preferredLocale):
            return .ok(.init(body: .json(
                Self.me(
                    id: id, email: email, workspaces: workspaces, canCreateWorkspace: canCreateWorkspace,
                    preferredLocale: preferredLocale
                )
            )))
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .notSignedIn))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        case .hang, .hangThenTelling:
            await withCheckedContinuation { continuation in
                hangingMes.append(continuation)
                let watchers = hangingMeWatchers
                hangingMeWatchers = []
                watchers.forEach { $0.resume() }
            }
            var told: Components.Schemas.Locale?
            if case let .hangThenTelling(locale) = asked { told = locale }
            return .ok(.init(body: .json(
                Self.me(id: Self.accountID, email: "owner@example.com", preferredLocale: told)
            )))
        }
    }

    func requestSignIn(_ input: Operations.RequestSignIn.Input) async throws -> Operations.RequestSignIn.Output {
        if case let .json(body) = input.body { signInRequests.append(body) }
        switch signInAnswer {
        case .accepted:
            return .accepted(.init())
        case .badRequest:
            return .badRequest(.init(body: .json(.init(code: .validationFailed, issues: []))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func exchangeSignInCode(
        _ input: Operations.ExchangeSignInCode.Input
    ) async throws -> Operations.ExchangeSignInCode.Output {
        if case let .json(body) = input.body { exchanges.append(body) }
        switch exchangeAnswer {
        case let .token(token):
            return .ok(.init(body: .json(.init(token: token))))
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .unauthorized))))
        case .badRequest:
            return .badRequest(.init(body: .json(.init(code: .validationFailed, issues: []))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func signOut(_ input: Operations.SignOut.Input) async throws -> Operations.SignOut.Output {
        signOutCalls += 1
        switch signOutAnswer {
        case .noContent:
            return .noContent(.init())
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .unauthorized))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        case .hang:
            await withCheckedContinuation { continuation in
                hanging.append(continuation)
                let watchers = hangWatchers
                hangWatchers = []
                watchers.forEach { $0.resume() }
            }
            return .noContent(.init())
        }
    }
}

extension StubAPI {
    func answerUpdateMe(with answer: UpdateMeAnswer) {
        updateMeAnswer = answer
    }

    func updateMe(_ input: Operations.UpdateMe.Input) async throws -> Operations.UpdateMe.Output {
        if case let .json(body) = input.body {
            savedLocales.append(body.preferredLocale.flatMap { Components.Schemas.Locale(rawValue: $0.rawValue) })
            savedSurfaces.append(body.surface)
        }
        switch updateMeAnswer {
        case .accepted:
            return .ok(.init(body: .json(Self.me(id: Self.accountID, email: "owner@example.com"))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }

    func getWorkspace(_ input: Operations.GetWorkspace.Input) async throws -> Operations.GetWorkspace.Output {
        requestedWorkspaces.append(input.path.workspaceId)
        if let workspaceStatus { return .undocumented(statusCode: workspaceStatus, .init()) }
        if goneWorkspaces.contains(input.path.workspaceId) {
            return .notFound(.init(body: .json(.init(code: .notFound))))
        }
        return .ok(.init(body: .json(.init(
            id: input.path.workspaceId, name: "Workspace", slug: "workspace", defaultLocale: .nlNL,
            timeZone: "Europe/Amsterdam"
        ))))
    }

    /// The permission matrix of `packages/domain` (F004): the Owner may do everything, the Trainer the clients and the list.
    private static func capabilities(
        of role: Components.Schemas.MyWorkspace.RolePayload
    ) -> [Components.Schemas.MyWorkspace.CapabilitiesPayloadPayload] {
        typealias Capability = Components.Schemas.MyWorkspace.CapabilitiesPayloadPayload
        return role == .owner ? Capability.allCases : [.trainers_view, .clients_view, .clients_manage]
    }

    func listMyWorkspaces(
        _ input: Operations.ListMyWorkspaces.Input
    ) async throws -> Operations.ListMyWorkspaces.Output {
        myWorkspacesCalls += 1
        switch myWorkspacesAnswer {
        case let .workspaces(memberships):
            return .ok(.init(body: .json(memberships.map {
                .init(
                    workspaceId: $0.workspaceID, name: $0.name, slug: $0.slug, role: $0.role,
                    capabilities: Self.capabilities(of: $0.role)
                )
            })))
        case .unauthorized:
            return .unauthorized(.init(body: .json(.init(code: .notSignedIn))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline:
            throw URLError(.notConnectedToInternet)
        }
    }
}

/// Operations the app doesn't call yet. In an extension so the stub's own body stays within SwiftLint's length limit.
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
}
