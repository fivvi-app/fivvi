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
    @ToolbarContentBuilder func newMenu(from origin: ProTab, enabled: Bool = true) -> some ToolbarContent {
        let menu = NewMenu(capabilities: account.capabilities)
        if clients != nil, menu.isVisible {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if menu.showsPrivateSession {
                        Button(catalog[.newPrivateSession]) { openNewSession(from: origin) }
                            .accessibilityIdentifier("home.newPrivateSession")
                    }
                    if menu.showsGroupClass {
                        Button(catalog[.newGroupClass]) { openNewClass(from: origin) }
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
                .disabled(!enabled)
                .accessibilityLabel(catalog[.newLabel])
                .accessibilityIdentifier("home.new")
            }
        }
    }

    /// PS-04 in the current workspace, from the tab `origin`; *Plannen* on Vandaag hands it the start of the free gap.
    func openNewSession(from origin: ProTab, start: Date? = nil) {
        guard let workspace = account.workspace, case let .loaded(email) = account.state else { return }
        let capabilities = account.capabilities
        sheetOrigin = origin
        newSession = NewSessionViewModel(
            api: api, workspace: workspace, catalog: catalog,
            forAnyTrainer: capabilities.allows(.session_private_manage_any), email: email,
            accountName: account.accountName, start: start, onForbidden: { await capabilities.forbidden($0) }
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
                        if sheetOrigin == .home {
                            path.append(.session(session.id))
                        } else if let workspace = account.workspace {
                            openSaved(.session(workspaceID: workspace.id, id: session.id))
                        }
                    },
                    onCancel: { newSession = nil }
                )
            }
            .presentationDetents([.large])
        }
    }

    /// Where a saved session or class opens: in the stack of the tab the sheet came from, and Agenda reads again.
    func openSaved(_ route: PersonalRoute) {
        if sheetOrigin == .calendar {
            calendarPath.append(route)
            Task { await agenda.load() }
        } else {
            todayPath.append(route)
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
    let workspaceID: String
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    let onOpenClient: ((String) -> Void)?

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, language: AppLanguage,
        capabilities: WorkspaceCapabilities, onOpenClient: ((String) -> Void)?
    ) {
        _model = State(initialValue: SessionViewModel(
            api: api, workspace: workspace, sessionID: sessionID, catalog: language.catalog,
            canCancelAny: capabilities.allows(.session_private_cancel_any, in: workspace.id),
            canCancelOwn: capabilities.allows(.session_private_cancel_own, in: workspace.id),
            onForbidden: { await capabilities.forbidden($0, in: workspace.id) }
        ))
        workspaceID = workspace.id
        self.language = language
        self.capabilities = capabilities
        self.onOpenClient = onOpenClient
    }

    var body: some View {
        SessionView(
            model: model, language: language,
            canMove: capabilities.allows(.session_private_manage_own, in: workspaceID)
                || capabilities.allows(.session_private_manage_any, in: workspaceID),
            onOpenClient: onOpenClient
        )
    }
}
