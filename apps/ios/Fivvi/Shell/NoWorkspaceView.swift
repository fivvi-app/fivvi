import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// The accessibility identifiers of one tab's no-workspace state, the same values as the Android test tags: `home.noWorkspace`,
/// `home.haveLink`, `home.teamHint`, `home.loading`, `home.error`, `home.retry`, and the same for `book`.
struct NoWorkspaceIDs {
    let title: String
    let haveLink: String
    let teamHint: String
    let loading: String
    let error: String
    let retry: String

    init(_ prefix: String) {
        title = "\(prefix).noWorkspace"
        haveLink = "\(prefix).haveLink"
        teamHint = "\(prefix).teamHint"
        loading = "\(prefix).loading"
        error = "\(prefix).error"
        retry = "\(prefix).retry"
    }

    static let home = NoWorkspaceIDs("home")
    static let book = NoWorkspaceIDs("book")
}

/// *Home* and *Boeken* until the client belongs to a workspace (F029, F032): "Vraag je studio om de aanmeldlink." with "Heb
/// je de link al? Open hem op deze telefoon." When the account has a team role somewhere it also says "Ben je trainer of
/// eigenaar? Gebruik de app Fivvi Pro." and shows no team data (E017 AC3). The large title is the first line; the others
/// are in a card. One scroll, so text at the largest size wraps instead of being cut off.
struct NoWorkspaceView: View {
    let state: AccountViewModel.State
    let catalog: Catalog
    let ids: NoWorkspaceIDs
    let onRetry: () -> Void

    var body: some View {
        LargeTitleScreen(title: catalog[.noWorkspaceTitle], titleIdentifier: ids.title) {
            switch state {
            case .loading:
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(catalog[.commonLoading])
                    .accessibilityIdentifier(ids.loading)
            case let .loaded(_, _, hasTeamRole):
                Card {
                    VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
                        line(catalog[.noWorkspaceHaveLink], id: ids.haveLink)
                        if hasTeamRole { line(catalog[.noWorkspaceTeamHint], id: ids.teamHint) }
                    }
                }
            case .failed:
                VStack(spacing: Tokens.Spacing.space4) {
                    StatusMessage(text: catalog[.signInErrorsGeneric], kind: .error, id: ids.error)
                    PillButtonStack {
                        Button(action: onRetry) {
                            Text(catalog[.commonRetry])
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.pill(.filled))
                        .accessibilityIdentifier(ids.retry)
                    }
                }
            }
        }
    }

    private func line(_ text: String, id: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(Tokens.Colors.textPrimary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier(id)
    }
}
