import SwiftUI
import FivviAPI
import FivviDesignTokens

/// The signed-in home, a placeholder until the tab bar arrives. `GET /api/v1/me` decides what it shows (F002 AC10): the
/// workspace's name with the hello block, the text to set a workspace up on the web with a button that opens trainer
/// web in the browser, or the no-access text. Under it always sit the address of the account that is signed in and the
/// sign-out button.
struct HomeView: View {
    @Environment(\.openURL) private var openURL
    @State private var hello: HelloViewModel
    @State private var account: AccountViewModel
    private let catalog: Catalog
    private let welcomeURL: URL

    /// `welcomeURL` is trainer web's first-run screen, which the set-up button opens in the system browser.
    /// `onAccount` is told the account's ID once `GET /api/v1/me` has answered; the app passes it to error reporting.
    /// `onSignedOut` runs after the person signed out and the token is gone; its argument says whether the API
    /// refused the token of the sign-out call.
    init(
        api: any APIProtocol, store: any SessionStore, catalog: Catalog, welcomeURL: URL,
        onAccount: @escaping (String) -> Void,
        onSignedOut: @escaping (Bool) -> Void
    ) {
        _hello = State(initialValue: HelloViewModel(api: api, catalog: catalog))
        _account = State(initialValue: AccountViewModel(
                api: api, store: store, onAccount: onAccount, onSignedOut: onSignedOut
            ))
        self.catalog = catalog
        self.welcomeURL = welcomeURL
    }

    /// One scroll for the whole screen, so the account block can't squeeze the hello block at the largest text size
    /// (#233). The spacers share what is left when both fit (the hello block centred above the account block) and give
    /// way when not.
    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: Tokens.Spacing.space4) {
                        destination
                        // One hello block in one place, so it loads once whether /me is loading, failed or answered
                        // with a workspace; the other states have their own text instead.
                        if showsHello {
                            HelloView(model: hello)
                                .padding(.horizontal, Tokens.Spacing.gutter)
                        }
                    }
                    Spacer(minLength: 0)
                    accountLine
                }
                .frame(minHeight: proxy.size.height)
            }
        }
        .background(Tokens.Colors.bgCanvas)
        .task { await account.load() }
    }

    private var showsHello: Bool {
        switch account.destination {
        case nil, .workspace: true
        case .setUpOnWeb, .noAccess: false
        }
    }

    @ViewBuilder private var destination: some View {
        switch account.destination {
        case let .workspace(name):
            VStack(spacing: Tokens.Spacing.space4) {
                Text(name)
                    .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("home.workspaceName")
            }
            .padding(.horizontal, Tokens.Spacing.gutter)
        case .setUpOnWeb:
            VStack(spacing: Tokens.Spacing.space6) {
                message(catalog[.setUpOnWeb], id: "home.setUpOnWeb")
                // Opens the system browser, never a web view.
                Button {
                    openURL(welcomeURL)
                } label: {
                    Text(catalog[.openWeb])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("home.openWeb")
            }
            .padding(.horizontal, Tokens.Spacing.gutter)
        case .noAccess:
            VStack(spacing: Tokens.Spacing.space4) {
                Text(catalog[.noAccessTitle])
                    .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("home.noAccessTitle")
                message(catalog[.noAccessBody], id: "home.noAccess")
            }
            .padding(.horizontal, Tokens.Spacing.gutter)
        case nil:
            EmptyView()
        }
    }

    private func message(_ text: String, id: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(Tokens.Colors.textPrimary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier(id)
    }

    private var accountLine: some View {
        VStack(spacing: Tokens.Spacing.space4) {
            accountState
            signOut
        }
        .padding(Tokens.Spacing.gutter)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.account")
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
