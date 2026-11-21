import SwiftUI
import FivviAPI
import FivviLanguage
import FivviStrings
import FivviUI

/// A screen the personal tabs push (F013): TD-02 for a private session and TD-03 for a class date, each with the item's
/// workspace as an explicit parameter. The current workspace (F012) is not changed by opening one, and *‹ Vandaag*
/// returns.
enum PersonalRoute: Hashable {
    case session(workspaceID: String, id: String)
    case classDate(workspaceID: String, id: String)

    init(_ row: PersonalRow) {
        self = row.isGroup
            ? .classDate(workspaceID: row.workspaceID, id: row.id) : .session(workspaceID: row.workspaceID, id: row.id)
    }

    var workspaceID: String {
        switch self {
        case let .session(workspaceID, _), let .classDate(workspaceID, _): workspaceID
        }
    }
}

/// The screen of a `PersonalRoute`: it reads the item's workspace first (the person's role and permissions there are the
/// ones the screen uses), then shows TD-02 or TD-03 for it.
struct PersonalDestination: View {
    let route: PersonalRoute
    let api: any APIProtocol
    let language: AppLanguage
    let account: AccountViewModel
    @State private var workspace: CurrentWorkspace?
    @State private var unavailable = false

    var body: some View {
        Group {
            if let workspace {
                switch route {
                case let .session(_, id):
                    SessionScreen(
                        api: api, workspace: workspace, sessionID: id, language: language,
                        capabilities: account.capabilities, onOpenClient: nil
                    )
                case let .classDate(_, id):
                    ClassDateScreen(
                        api: api, workspace: workspace, sessionID: id, added: nil, language: language,
                        capabilities: account.capabilities
                    )
                }
            } else if unavailable {
                StatusMessage(text: language.catalog[.todayFailed], kind: .error, id: "personal.unavailable")
                    .padding()
            } else {
                ProgressView()
                    .accessibilityLabel(language.catalog[.commonLoading])
                    .accessibilityIdentifier("personal.loading")
            }
        }
        .task {
            workspace = await account.workspace(id: route.workspaceID)
            unavailable = workspace == nil
        }
    }
}
