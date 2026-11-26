import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviSession
import FivviLanguage
import FivviUI
import FivviObservability

/// The signed-in home, a placeholder until the tab bar arrives. `GET /api/v1/me` decides what it shows (F002 AC10): the
/// workspace's name as the large title, the text to set a workspace up on the web with a button that opens trainer
/// web in the browser, or the no-access text. Under it always sit the address of the account that is signed in and the
/// sign-out button; above it the button *Klanten* opens TM-02 when the capability helper allows `clients.view` (F006),
/// and the button *Profiel* opens TM-04, the person's workspaces with their roles (F003). Choosing another workspace
/// there makes it the current one and returns here, the first tab (F012): its name shows on this screen.
struct HomeView: View {
    /// The screens above the home; emptying the path returns to it (switching workspace resets the stack, F012).
    enum Route: Hashable {
        case clients, profile
        /// A client's profile (TM-03), opened from the list, after an addition or by ID.
        case client(ClientRoute)
        /// A private session's screen (TD-02), by ID: after planning one, and from *Komende sessies* of a profile.
        case session(String)
        /// A class on a date (TD-03), by ID: after adding a class (`added`: "Groepsles toegevoegd" shows) and later from
        /// the calendars.
        case classDate(String, added: Int?)
        /// CO-05 *Aanwezigheid* of a class date, from TD-03 (F025).
        case attendance(AttendanceRoute)
    }

    @Environment(\.openURL) private var openURL
    @State var account: AccountViewModel
    @State private var profile: ProfileViewModel
    /// The clients of the workspace on screen, kept while the home lives so the list stays at hand (F006).
    @State var clients: ClientsViewModel?
    @State var path: [Route] = []
    /// The tabs (F013): Vandaag first, then Agenda, then the home of the current workspace.
    @State var tab = ProTab.initial()
    /// The attendance taps waiting to be sent (F025): every screen that takes attendance queues them here.
    @State var attendance: AttendanceQueue
    @State var today: TodayViewModel
    /// The Owner's *Mijn dag | Hele studio* (F014): the workspace's day, for a workspace with a team.
    @State var studio: StudioDayModel
    @State var todayPath: [PersonalRoute] = []
    /// TD-04 *Agenda* (F013): the week or the month of the personal scope.
    @State var agenda: AgendaModel
    @State var calendarPath: [PersonalRoute] = []
    /// The tab a sheet was opened from: where the person lands once it saved something.
    @State var sheetOrigin = ProTab.home
    /// PS-04, while its sheet is open (F020).
    @State var newSession: NewSessionViewModel?
    /// TD-05, while its sheet is open (F021).
    @State var newClass: NewGroupClassViewModel?
    let api: any APIProtocol
    let language: AppLanguage
    /// Whether the phone is online: TD-02 and TD-03 turn *Annuleren* off without it (F026).
    let connectivity: Connectivity
    private let welcomeURL: URL

    var catalog: Catalog { language.catalog }

    /// `welcomeURL` is trainer web's first-run screen, which the set-up button opens in the system browser.
    /// `onAccount` is told the account's ID once `GET /api/v1/me` has answered; the app passes it to error reporting.
    /// `onSignedOut` runs after the person signed out and the token is gone; its argument says whether the API
    /// refused the token of the sign-out call.
    init(
        api: any APIProtocol, store: any SessionStore, language: AppLanguage, connectivity: Connectivity,
        welcomeURL: URL, onAccount: @escaping (String) -> Void,
        onSignedOut: @escaping (Bool) -> Void,
        personal: any PersonalStore = FilePersonalStore.shared,
        attendanceStore: any PersonalStore = FilePersonalStore.attendance
    ) {
        let queue = AttendanceQueue(api: api, store: attendanceStore, session: store) { connectivity.isOnline }
        _attendance = State(initialValue: queue)
        // The account is known: what an earlier sign-in of it left goes on (#1618). The person chose to sign out (after
        // the warning of the button): what waits is cleared; a rejected token signs out elsewhere and keeps it.
        let account = AccountViewModel(
            api: api, store: store, onAccount: { queue.learn(account: $0); onAccount($0) },
            onSignedOut: { queue.clear(); onSignedOut($0) },
            onPreferredLocale: { language.startRead() }, workspaces: .persistent()
        )
        _today = State(initialValue: TodayViewModel(
            api: api, catalog: language.catalog, store: personal, now: UITestClock.provider(), attendance: queue,
            refreshAccount: { [account] in await account.refreshedMemberships() }
        ))
        _studio = State(initialValue: StudioDayModel(
            api: api, catalog: language.catalog, now: UITestClock.provider(), attendance: queue,
            onForbidden: { [capabilities = account.capabilities] in await capabilities.forbidden(.calendar_manage) }
        ))
        _agenda = State(initialValue: AgendaModel(
            api: api, catalog: language.catalog, store: personal, now: UITestClock.provider()
        ))
        _profile = State(initialValue: ProfileViewModel(api: api, catalog: language.catalog))
        _account = State(initialValue: account)
        self.api = api
        self.language = language
        self.connectivity = connectivity
        self.welcomeURL = welcomeURL
    }

    var body: some View {
        TabView(selection: $tab) {
            SwiftUI.Tab(catalog[.tabToday], systemImage: "sun.max", value: ProTab.today) { todayStack }
                .accessibilityIdentifier("tab.today")
            SwiftUI.Tab(catalog[.tabCalendar], systemImage: "calendar", value: ProTab.calendar) { calendarStack }
                .accessibilityIdentifier("tab.calendar")
            SwiftUI.Tab(catalog[.tabHome], systemImage: "house", value: ProTab.home) { homeStack }
                .accessibilityIdentifier("tab.home")
        }
        .fivviTabBar()
        .attendanceQueueLifecycle(queue: attendance, connectivity: connectivity) {
            await personalChanged()
            await studio.refresh()
        }
        // A language chosen before signing in, or in iOS Settings, is saved first; then the account's stored language is
        // read, so an older stored one can't override it (F010).
        .task {
            await language.save()
            await account.load()
        }
        // Coming back to the app asks again: a workspace the person lost access to meanwhile is noticed (F003 AC6), and
        // a language changed on the web is adopted (F010 AC2); Vandaag reads the day again.
        .onReturnToForeground {
            await attendance.flush()
            await language.save()
            await account.refresh()
            await today.load()
            await studio.refresh()
            if tab == .calendar { await agenda.load() }
        }
        // The clients' model follows the workspace the account shows: a new workspace is a new list, none is no list.
        .onChange(of: account.workspace, initial: true) { _, workspace in useWorkspace(workspace) }
        .onChange(of: account.memberships) { _, listed in listed.map(today.workspacesListed) }
        .sheet(item: $newSession) { form in newSessionSheet(form) }
        .sheet(item: $newClass) { form in newClassSheet(form) }
        .onChange(of: language.catalog) { _, catalog in
            profile.use(catalog)
            clients?.use(catalog)
            today.use(catalog)
            studio.use(catalog)
            agenda.use(catalog)
        }
    }

    /// The home of the current workspace: its name, *Klanten*, *Profiel* and the account.
    private var homeStack: some View {
        NavigationStack(path: $path) {
            screen
                .navigationDestination(for: Route.self) { route in
                    Group {
                        switch route {
                        case .clients: clientsScreen
                        case .profile: profileScreen
                        case let .client(route): clientProfileScreen(route)
                        case let .session(id): sessionScreen(id)
                        case let .classDate(id, added): classDateScreen(id, added: added)
                        case let .attendance(route): attendanceScreen(route)
                        }
                    }
                    // The screens below the home are second-level screens with forms and long lists: the glass bar would
                    // float over their last rows and over their sheets, so they hide it, as the system's own apps do.
                    .toolbarVisibility(.hidden, for: .tabBar)
                }
        }
    }

    /// The workspace's name is the large title; before it is known, or with none, the app's name is.
    private var title: String {
        if case let .workspace(name) = account.destination { return name }
        return catalog[.appName]
    }

    private var titleIdentifier: String {
        if case .workspace = account.destination { return "home.workspaceName" }
        return "home.title"
    }

    /// One scroll for the whole screen, so the account block can't squeeze what is above it at the largest text size
    /// (#233): the large title, then the cards and the group of rows in the grouped list (E020 #629, *Vandaag* in
    /// the prototype), and the account's card last.
    private var screen: some View {
        LargeTitleScreen(title: title, titleIdentifier: titleIdentifier) {
            destination
            rows
            accountCard
        }
        .toolbar { newMenu(from: .home) }
        .openingClassDateForUITest(path: $path, ready: accountIsReady)
    }

    /// What `GET /api/v1/me` says besides the workspace's name (the title): the text to set one up on the web, or the
    /// no-access text.
    @ViewBuilder private var destination: some View {
        switch account.destination {
        case .setUpOnWeb:
            Card {
                VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
                    message(catalog[.setUpOnWeb], id: "home.setUpOnWeb")
                    // Opens the system browser, never a web view.
                    PillButtonStack {
                        Button {
                            openURL(welcomeURL)
                        } label: {
                            pillLabel(catalog[.openWeb])
                        }
                        .buttonStyle(.pill(.filled))
                        .accessibilityIdentifier("home.openWeb")
                    }
                }
            }
        case .noAccess:
            Card {
                VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
                    Text(catalog[.noAccessTitle])
                        .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("home.noAccessTitle")
                    message(catalog[.noAccessBody], id: "home.noAccess")
                }
            }
        case .workspace, nil:
            EmptyView()
        }
    }

    /// The signed-in address and Sign out, in a card of their own at the end.
    private var accountCard: some View {
        Card {
            VStack(spacing: Tokens.Spacing.space2) {
                accountState
                signOut
            }
            .frame(maxWidth: .infinity)
        }
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

    /// *Klanten* (TM-02), for whoever the helper lets see them, and *Profiel* (TM-04): the person's workspaces with
    /// their role. Rows of a group, with a chevron.
    private var rows: some View {
        InsetGroup {
            if clients != nil, account.capabilities.allows(.clients_view) {
                NavigationLink(value: Route.clients) {
                    InsetRow(title: catalog[.clientsTitle], showsChevron: true)
                }
                .buttonStyle(.insetRow)
                .accessibilityIdentifier("home.openClients")
            }
            NavigationLink(value: Route.profile) {
                InsetRow(title: catalog[.profileTitle], showsChevron: true)
            }
            .buttonStyle(.insetRow)
            .accessibilityIdentifier("home.openProfile")
        }
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

    private var signOut: some View {
        SignOutButton(
            catalog: catalog, isSigningOut: account.isSigningOut, waiting: attendance.entries.count,
            onSignOut: { await account.signOut() }
        )
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
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("home.signedInAs")
                    // The release check's crash, armed in TestFlight builds only (E017); no string, no control.
                    .testFlightCrashTrigger()
            case .failed:
                PillButtonStack {
                    Button {
                        Task { await account.load() }
                    } label: {
                        pillLabel(catalog[.commonRetry])
                    }
                    .buttonStyle(.pill(.filled))
                    .accessibilityIdentifier("home.retry")
                }
            }
        }
    }
}

/// The screens *Klanten* opens, which the home's stack owns (#684).
extension HomeView {
    @ViewBuilder private var clientsScreen: some View {
        if let clients {
            ClientsView(
                model: clients, language: language, capabilities: account.capabilities,
                onOpen: { path.append(.client($0)) }
            )
        }
    }

    /// *Klantprofiel* (TM-03). Opening another client from its edit form replaces this profile, not stacks on it.
    @ViewBuilder private func clientProfileScreen(_ route: ClientRoute) -> some View {
        if let clients {
            ClientProfileScreen(
                model: clients, route: route, language: language, capabilities: account.capabilities,
                onOpenExisting: { id in
                    guard let last = path.indices.last else { return }
                    path[last] = .client(ClientRoute(id: id))
                },
                onOpenSession: { path.append(.session($0)) }
            )
            .id(route.id)
        }
    }
}

/// Small text pieces of the home, kept apart so the screen's own body stays short.
extension HomeView {
    fileprivate func message(_ text: String, id: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(Tokens.Colors.textPrimary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier(id)
    }

    fileprivate func pillLabel(_ text: String) -> some View {
        Text(text)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }
}
