import Observation
import SwiftUI
import FivviAPI
import FivviDesignTokens
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

/// Reads the item's workspace for a `PersonalRoute`: the person's role and permissions there are the ones its screen uses.
/// When it can't be read it says why (offline, or the details couldn't be loaded) and *Opnieuw* reads it again.
@MainActor
@Observable
final class PersonalDestinationModel {
    enum State: Equatable {
        case loading
        case ready(CurrentWorkspace)
        /// The person is not on it any more, or the API refused it.
        case unavailable
        case offline
    }

    private(set) var state = State.loading
    private let route: PersonalRoute
    private let account: AccountViewModel

    init(route: PersonalRoute, account: AccountViewModel) {
        self.route = route
        self.account = account
    }

    /// `retry` asks the account again first: the list of workspaces may be what was missing.
    func load(retry: Bool = false) async {
        state = .loading
        if retry { await account.refresh() }
        switch await account.workspace(id: route.workspaceID) {
        case let .found(workspace): state = .ready(workspace)
        case .unavailable: state = .unavailable
        case .offline: state = .offline
        }
    }

    /// *Je bent offline…* without a connection, otherwise *De gegevens konden niet worden geladen.*
    func message(_ catalog: Catalog) -> String? {
        switch state {
        case .loading, .ready: nil
        case .unavailable: catalog[.sessionFormLoadFailed]
        case .offline: catalog[.commonOffline]
        }
    }
}

/// The screen of a `PersonalRoute`: it reads the item's workspace first, then shows TD-02 or TD-03 for it.
struct PersonalDestination: View {
    let route: PersonalRoute
    let api: any APIProtocol
    let language: AppLanguage
    let account: AccountViewModel
    @State private var model: PersonalDestinationModel

    init(route: PersonalRoute, api: any APIProtocol, language: AppLanguage, account: AccountViewModel) {
        self.route = route
        self.api = api
        self.language = language
        self.account = account
        _model = State(initialValue: PersonalDestinationModel(route: route, account: account))
    }

    var body: some View {
        Group {
            if case let .ready(workspace) = model.state {
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
            } else if let message = model.message(language.catalog) {
                VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
                    StatusMessage(text: message, kind: .error, id: "personal.unavailable")
                    PillButtonStack {
                        Button { Task { await model.load(retry: true) } } label: {
                            Text(language.catalog[.commonRetry]).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.pill(.filled))
                        .accessibilityIdentifier("personal.retry")
                    }
                }
                .padding()
            } else {
                ProgressView()
                    .accessibilityLabel(language.catalog[.commonLoading])
                    .accessibilityIdentifier("personal.loading")
            }
        }
        .task { await model.load() }
    }
}
