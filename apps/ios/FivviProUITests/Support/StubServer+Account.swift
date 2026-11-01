import Foundation

/// The account the stub server knows, and its workspaces.
extension StubServer {
    /// The account the sign-in routes know: its address, the code that works and the token that code is exchanged for.
    struct SignIn: Sendable {
        var email = "owner@example.com"
        var code = "123456"
        var token = "stub-session-token"
        /// The name of the account's one workspace, or nil for none (F002).
        var workspaceName: String? = "John's Gym"
        /// The role in that workspace (`owner` or `trainer`).
        var role = "owner"
        /// More workspaces the account is on the team of, after the first (F003).
        var otherWorkspaces: [Workspace] = []
        /// Whether `GET /api/v1/me` says the account may create a workspace.
        var canCreateWorkspace = false
        /// An error status for `GET /api/v1/me`, or nil to answer as the API does.
        var meStatus: Int?
        /// The account's stored language (`nl-NL` or `en`) at the start, or nil for none (F010).
        var preferredLocale: String?
    }

    /// A workspace of the account (synthetic).
    struct Workspace: Sendable, Equatable {
        let name: String
        let role: String
    }
}
