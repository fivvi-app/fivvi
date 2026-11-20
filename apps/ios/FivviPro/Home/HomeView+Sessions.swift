import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviSession
import FivviUI

/// The private session screens of the home's stack (F020): **+** → *Privésessie* (PS-04), TD-02 and, from it, PS-05.
extension HomeView {
    /// **+** in the bar of the home: *Privésessie* for whoever may plan sessions, *Groepsles* for whoever has
    /// `class.manage` (F021); a team member who plans sessions but not classes reads that the owner plans them.
    @ToolbarContentBuilder var newMenu: some ToolbarContent {
        let menu = NewMenu(capabilities: account.capabilities)
        if clients != nil, menu.isVisible {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if menu.showsPrivateSession {
                        Button(catalog[.newPrivateSession]) { openNewSession() }
                            .accessibilityIdentifier("home.newPrivateSession")
                    }
                    if menu.showsGroupClass {
                        Button(catalog[.newGroupClass]) { openNewClass() }
                            .accessibilityIdentifier("home.newGroupClass")
                    }
                    if menu.showsGroupClassNote, let workspace = account.workspace {
                        Button(menu.groupClassNote(workspaceName: workspace.name, catalog: catalog)) {}
                            .disabled(true)
                            .accessibilityIdentifier("home.newGroupClassNote")
                    }
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
        if let workspace = account.workspace, case .loaded = account.state {
            let capabilities = account.capabilities
            SessionScreen(
                api: api, workspace: workspace, sessionID: id, language: language, capabilities: capabilities,
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
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, language: AppLanguage,
        capabilities: WorkspaceCapabilities, onOpenClient: @escaping (String) -> Void
    ) {
        _model = State(initialValue: SessionViewModel(
            api: api, workspace: workspace, sessionID: sessionID, catalog: language.catalog,
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
