import SwiftUI
import FivviAPI
import FivviDesignTokens

/// The signed-in home, a placeholder until the tab bar arrives: the hello screen, plus the address of the account that
/// is signed in, from `GET /api/v1/me`.
struct HomeView: View {
    @State private var hello: HelloViewModel
    @State private var account: AccountViewModel
    private let catalog: Catalog

    /// `onSignedOut` runs after the person signed out and the token is gone.
    init(api: any APIProtocol, store: any SessionStore, catalog: Catalog, onSignedOut: @escaping () -> Void) {
        _hello = State(initialValue: HelloViewModel(api: api, catalog: catalog))
        _account = State(initialValue: AccountViewModel(api: api, store: store, onSignedOut: onSignedOut))
        self.catalog = catalog
    }

    var body: some View {
        HelloView(model: hello)
            .safeAreaInset(edge: .bottom, spacing: 0) { accountLine }
            .task { await account.load() }
    }

    private var accountLine: some View {
        VStack(spacing: Tokens.Spacing.space4) {
            accountState
            signOut
        }
        .padding(Tokens.Spacing.gutter)
        .frame(maxWidth: .infinity)
        .background(Tokens.Colors.bgCanvas)
    }

    @ViewBuilder private var signOut: some View {
        if account.isSigningOut {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("home.signingOut")
        } else {
            Button {
                Task { await account.signOut() }
            } label: {
                Text(catalog[.signOutLabel])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.secondaryAction)
            .accessibilityIdentifier("home.signOut")
        }
    }

    @ViewBuilder private var accountState: some View {
        Group {
            switch account.state {
            case .loading:
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .accessibilityLabel(catalog[.commonLoading])
                    .accessibilityIdentifier("home.loading")
            case let .loaded(email):
                Text(catalog.string(.homeSignedInAs, email))
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("home.signedInAs")
            case .failed:
                Button {
                    Task { await account.load() }
                } label: {
                    Text(catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("home.retry")
            }
        }
    }
}
