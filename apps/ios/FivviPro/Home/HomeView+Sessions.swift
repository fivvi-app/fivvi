import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviSession
import FivviUI

/// The private session screens of the home's stack (F020): **+** → *Privésessie* (PS-04), TD-02 and, from it, PS-05.
extension HomeView {
    /// The person may plan private sessions in the workspace on screen: their own (every team member who trains) or
    /// anyone's (`session.private.manage.any`).
    private var mayPlanSessions: Bool {
        let capabilities = account.capabilities
        return capabilities.allows(.session_private_manage_own) || capabilities.allows(.session_private_manage_any)
    }

    /// **+** in the bar of the home: *Privésessie*, for whoever may plan sessions. The classes join it with their features.
    @ToolbarContentBuilder var newMenu: some ToolbarContent {
        if clients != nil, mayPlanSessions {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button(catalog[.newPrivateSession]) { openNewSession() }
                        .accessibilityIdentifier("home.newPrivateSession")
                } label: {
                    Image(systemName: "plus")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(catalog[.newLabel])
                .accessibilityIdentifier("home.new")
            }
        }
    }

    private func openNewSession() {
        guard let workspace = account.workspace, case let .loaded(email) = account.state else { return }
        let capabilities = account.capabilities
        newSession = NewSessionViewModel(
            api: api, workspace: workspace, catalog: catalog,
            forAnyTrainer: capabilities.allows(.session_private_manage_any), email: email,
            accountName: account.accountName, onForbidden: { await capabilities.forbidden($0) }
        )
    }

    /// PS-04 in a sheet of its own stack; once saved the sheet goes and TD-02 of the new session opens.
    @ViewBuilder func newSessionSheet(_ form: NewSessionViewModel) -> some View {
        if let clients {
            NavigationStack {
                NewSessionView(
                    model: form, clients: clients, language: language,
                    canAddClients: account.capabilities.allows(.clients_manage),
                    onSaved: { session in
                        newSession = nil
                        path.append(.session(session.id))
                    },
                    onCancel: { newSession = nil }
                )
            }
            .presentationDetents([.large])
        }
    }

    /// TD-02 for the session `id`.
    @ViewBuilder func sessionScreen(_ id: String) -> some View {
        if let workspace = account.workspace, case let .loaded(email) = account.state {
            let capabilities = account.capabilities
            SessionScreen(
                api: api, workspace: workspace, sessionID: id, language: language, email: email,
                accountName: account.accountName, capabilities: capabilities,
                onOpenClient: { path.append(.client(ClientRoute(id: $0))) }
            )
            .id(id)
        }
    }
}

/// Owns the model of one session screen for as long as the screen is pushed.
struct SessionScreen: View {
    @State private var model: SessionViewModel
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    let onOpenClient: (String) -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, language: AppLanguage, email: String,
        accountName: String?, capabilities: WorkspaceCapabilities, onOpenClient: @escaping (String) -> Void
    ) {
        _model = State(initialValue: SessionViewModel(
            api: api, workspace: workspace, sessionID: sessionID, catalog: language.catalog, email: email,
            accountName: accountName, readTeam: capabilities.allows(.team_view),
            onForbidden: { await capabilities.forbidden($0) }
        ))
        self.language = language
        self.capabilities = capabilities
        self.onOpenClient = onOpenClient
    }

    var body: some View {
        SessionView(
            model: model, language: language,
            canMove: capabilities.allows(.session_private_manage_own)
                || capabilities.allows(.session_private_manage_any),
            onOpenClient: onOpenClient
        )
    }
}
