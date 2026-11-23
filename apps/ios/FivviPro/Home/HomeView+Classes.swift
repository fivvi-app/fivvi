import SwiftUI
import FivviAPI
import FivviStrings
import FivviLanguage
import FivviSession
import FivviUI

/// The group class screens of the home's stack (F021): **+** → *Groepsles* (TD-05, the Owner) and TD-03.
extension HomeView {
    /// The account and its workspace are read: the screens of the stack can open.
    var accountIsReady: Bool {
        guard account.workspace != nil, case .loaded = account.state else { return false }
        return true
    }

    func openNewClass(from origin: ProTab) {
        guard let workspace = account.workspace, case let .loaded(email) = account.state else { return }
        let capabilities = account.capabilities
        sheetOrigin = origin
        newClass = NewGroupClassViewModel(
            api: api, workspace: workspace, catalog: catalog, email: email, accountName: account.accountName,
            onForbidden: { await capabilities.forbidden($0) }
        )
    }

    /// TD-05 in a sheet of its own stack; once saved the sheet goes and TD-03 of the new date opens.
    func newClassSheet(_ form: NewGroupClassViewModel) -> some View {
        NavigationStack {
            NewGroupClassView(
                model: form, language: language,
                onSaved: { date, datesAdded in
                    newClass = nil
                    if sheetOrigin == .home {
                        path.append(.classDate(date.id, added: datesAdded))
                    } else if let workspace = account.workspace {
                        openSaved(.classDate(workspaceID: workspace.id, id: date.id))
                    }
                },
                onCancel: { newClass = nil }
            )
        }
        .presentationDetents([.large])
    }

    /// TD-03 for the class date `id`.
    @ViewBuilder func classDateScreen(_ id: String, added: Int?) -> some View {
        if let workspace = account.workspace, case .loaded = account.state {
            ClassDateScreen(
                api: api, workspace: workspace, sessionID: id, added: added, language: language,
                capabilities: account.capabilities
            )
            .id(id)
        }
    }
}

/// Owns the model of one class date screen for as long as the screen is pushed.
struct ClassDateScreen: View {
    @State private var model: ClassDateViewModel
    let language: AppLanguage

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, added: Int?, language: AppLanguage,
        capabilities: WorkspaceCapabilities
    ) {
        _model = State(initialValue: ClassDateViewModel(
            api: api, workspace: workspace, sessionID: sessionID, catalog: language.catalog,
            canManage: capabilities.allows(.class_manage, in: workspace.id), added: added,
            onForbidden: { await capabilities.forbidden($0, in: workspace.id) }
        ))
        self.language = language
    }

    var body: some View {
        ClassDateView(model: model, language: language)
    }
}
