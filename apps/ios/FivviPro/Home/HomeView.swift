import SwiftUI
import FivviAPI
import FivviDesignTokens

/// The signed-in home, a placeholder until the tab bar arrives: the hello screen, plus the address of the account that
/// is signed in, from `GET /api/v1/me`.
struct HomeView: View {
    @State private var hello: HelloViewModel
    @State private var account: AccountViewModel
    private let catalog: Catalog

    init(api: any APIProtocol, catalog: Catalog) {
        _hello = State(initialValue: HelloViewModel(api: api, catalog: catalog))
        _account = State(initialValue: AccountViewModel(api: api))
        self.catalog = catalog
    }

    var body: some View {
        HelloView(model: hello)
            .safeAreaInset(edge: .bottom, spacing: 0) { accountLine }
            .task { await account.load() }
    }

    @ViewBuilder private var accountLine: some View {
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
        .padding(Tokens.Spacing.gutter)
        .frame(maxWidth: .infinity)
        .background(Tokens.Colors.bgCanvas)
    }
}
