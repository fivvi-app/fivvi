import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviSession
import FivviLanguage
import FivviUI

/// The signed-in home, a placeholder until the tab bar arrives. `GET /api/v1/me` decides what it shows (F002 AC10): the
/// workspace's name with the hello block, the text to set a workspace up on the web with a button that opens trainer
/// web in the browser, or the no-access text. Under it always sit the address of the account that is signed in and the
/// sign-out button; above it the button *Klanten* opens TM-02 when the capability helper allows `clients.view` (F006),
/// and the button *Profiel* opens TM-04, the person's workspaces with their roles (F003). Choosing another workspace
/// there makes it the current one and returns here, the first tab (F012): its name shows on this screen.
struct HomeView: View {
    /// The screens above the home; emptying the path returns to it (switching workspace resets the stack, F012).
    private enum Route: Hashable {
        case clients, profile
    }

    @Environment(\.openURL) private var openURL
    @State private var hello: HelloViewModel
    @State private var account: AccountViewModel
    @State private var profile: ProfileViewModel
    /// The clients of the workspace on screen, kept while the home lives so the list stays at hand (F006).
    @State private var clients: ClientsViewModel?
    @State private var path: [Route] = []
    private let api: any APIProtocol
    private let language: AppLanguage
    private let welcomeURL: URL

    private var catalog: Catalog { language.catalog }

    /// `welcomeURL` is trainer web's first-run screen, which the set-up button opens in the system browser.
    /// `onAccount` is told the account's ID once `GET /api/v1/me` has answered; the app passes it to error reporting.
    /// `onSignedOut` runs after the person signed out and the token is gone; its argument says whether the API
    /// refused the token of the sign-out call.
    init(
        api: any APIProtocol, store: any SessionStore, language: AppLanguage, welcomeURL: URL,
        onAccount: @escaping (String) -> Void,
        onSignedOut: @escaping (Bool) -> Void
    ) {
        _hello = State(initialValue: HelloViewModel(api: api, catalog: language.catalog))
        _profile = State(initialValue: ProfileViewModel(api: api, catalog: language.catalog))
        _account = State(initialValue: AccountViewModel(
            api: api, store: store, onAccount: onAccount, onSignedOut: onSignedOut,
            onPreferredLocale: { language.startRead() }, workspaces: .persistent()
        ))
        self.api = api
        self.language = language
        self.welcomeURL = welcomeURL
    }

    /// One scroll for the whole screen, so the account block can't squeeze the hello block at the largest text size
    /// (#233). The spacers share what is left when both fit (the hello block centred above the account block) and give
    /// way when not.
    var body: some View {
        NavigationStack(path: $path) {
            screen
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .clients: clientsScreen
                    case .profile: profileScreen
                    }
                }
        }
    }

    private var screen: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: Tokens.Spacing.space4) {
                        destination
                        clientsLink
                        profileLink
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
        // A language chosen before signing in, or in iOS Settings, is saved first; then the account's stored language is
        // read, so an older stored one can't override it (F010).
        .task {
            await language.save()
            await account.load()
        }
        // Coming back to the app asks again: a workspace the person lost access to meanwhile is noticed (F003 AC6), and
        // a language changed on the web is adopted (F010 AC2).
        .onReturnToForeground {
            await language.save()
            await account.refresh()
        }
        // The clients' model follows the workspace the account shows: a new workspace is a new list, none is no list.
        .onChange(of: account.workspace, initial: true) { _, workspace in useWorkspace(workspace) }
        .onChange(of: language.catalog) { _, catalog in
            hello.use(catalog)
            profile.use(catalog)
            clients?.use(catalog)
        }
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

    /// The clients' model is for the workspace on screen: kept while it is the same, new when it changes (F012).
    private func useWorkspace(_ workspace: CurrentWorkspace?) {
        guard let workspace else {
            clients = nil
            return
        }
        guard clients?.workspace != workspace else { return }
        let capabilities = account.capabilities
        clients = ClientsViewModel(
            api: api, workspace: workspace, catalog: language.catalog,
            onForbidden: { await capabilities.forbidden($0) }
        )
    }

    /// *Klanten* (TM-02): the workspace's clients, for whoever the helper lets see them.
    @ViewBuilder private var clientsLink: some View {
        if clients != nil, account.capabilities.allows(.clients_view) {
            NavigationLink(value: Route.clients) {
                Text(catalog[.clientsTitle])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.secondaryAction)
            .accessibilityIdentifier("home.openClients")
        }
    }

    @ViewBuilder private var clientsScreen: some View {
        if let clients {
            ClientsView(model: clients, language: language, capabilities: account.capabilities)
        }
    }

    /// *Profiel* (TM-04): the person's workspaces with their role.
    private var profileLink: some View {
        NavigationLink(value: Route.profile) {
            Text(catalog[.profileTitle])
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.secondaryAction)
        .accessibilityIdentifier("home.openProfile")
    }

    private var profileScreen: some View {
        ProfileView(
            model: profile, language: language, current: account.workspace?.id, onSelect: switchWorkspace,
            openLink: { openURL($0) }
        )
    }

    /// A workspace was chosen in *Profiel*: back to the first tab, whose workspace is the new one (F012).
    private func switchWorkspace(to id: String) {
        path = []
        Task { await account.switchWorkspace(to: id) }
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
