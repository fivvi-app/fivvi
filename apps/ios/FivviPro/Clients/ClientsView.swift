import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// A client to open on TM-03: from a row, from a client just added, or by ID (*Anna de Vries openen* on a duplicate).
struct ClientRoute: Hashable, Identifiable {
    let id: String
    let client: Components.Schemas.Client?
    let justAdded: Bool

    init(client: Components.Schemas.Client, justAdded: Bool = false) {
        id = client.id
        self.client = client
        self.justAdded = justAdded
    }

    init(id: String) {
        self.id = id
        client = nil
        justAdded = false
    }
}

/// *Klanten* / *Clients* (TM-02, F006): a large title, the search field, the clients sorted by name, pull to refresh
/// and *+ Nieuwe klant*, a floating button, when the capability helper allows `clients.manage`. A row opens TM-03.
/// Skeleton rows load, a failure says so with *Opnieuw proberen*, and a phone without a connection keeps the list it
/// has with its age.
struct ClientsView: View {
    let model: ClientsViewModel
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    @State private var searchText = ""
    @State private var newClient: ClientFormViewModel?
    @State private var opened: ClientRoute?
    /// The client to open once the sheet that added or found them is gone.
    @State private var afterSheet: ClientRoute?

    private var catalog: Catalog { model.catalog }

    var body: some View {
        List { content }
            .accessibilityIdentifier("clients.list")
            .listStyle(.plain)
            // Scrolling puts the keyboard of the search field away at once; a tap elsewhere would open a row.
            .scrollDismissesKeyboard(.immediately)
            .scrollContentBackground(.hidden)
            .background(Tokens.Colors.bgCanvas)
            .navigationTitle(catalog[.clientsTitle])
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $searchText, placement: .navigationBarDrawer(displayMode: .always),
                prompt: catalog[.clientsSearchPlaceholder]
            )
            .searchFieldIdentifier("clients.search")
            // Not in the navigation bar: while the search is active iOS replaces the bar with the search field, and the
            // action stays at hand, as the floating button of the Android app.
            .safeAreaInset(edge: .bottom, alignment: .trailing) {
                if capabilities.allows(.clients_manage) { newClientButton }
            }
            .refreshable { await model.refresh() }
            .task(id: searchText) { await searchChanged() }
            .task(id: model.state == .loading) { await model.watchSlowLoading() }
            .onReturnToForeground { await model.refresh() }
            .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
            .sheet(item: $newClient, onDismiss: openClientAfterSheet) { form in
                NavigationStack { newClientForm(form) }
                    .presentationDetents([.large])
            }
            .navigationDestination(item: $opened) { route in
                ClientProfileScreen(
                    model: model, route: route, language: language, capabilities: capabilities,
                    onOpenExisting: { opened = ClientRoute(id: $0) }
                )
                .id(route.id)
            }
            .environment(\.locale, catalog.formattingLocale)
    }

    /// Typing waits a moment for the next letter; coming back to the screen reads the list again at once.
    private func searchChanged() async {
        if searchText != model.query {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
        }
        await model.search(searchText)
    }

    private var newClientButton: some View {
        Button {
            newClient = model.newClientForm()
        } label: {
            Label(catalog[.clientsNewClient], systemImage: "plus")
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.primaryAction)
        .padding(Tokens.Spacing.gutter)
        .accessibilityIdentifier("clients.add")
    }

    private func newClientForm(_ form: ClientFormViewModel) -> some View {
        ClientFormView(
            model: form, idPrefix: "clients.add", submitID: "submit", title: catalog[.clientsNewClient],
            submitTitle: catalog[.clientsSubmit],
            onSaved: { client in
                model.didAdd(client)
                afterSheet = ClientRoute(client: client, justAdded: true)
                newClient = nil
            },
            onOpenExisting: { id in
                afterSheet = ClientRoute(id: id)
                newClient = nil
            },
            onCancel: { newClient = nil }
        )
        .onChange(of: language.catalog) { _, catalog in form.use(catalog) }
    }

    private func openClientAfterSheet() {
        guard let route = afterSheet else { return }
        afterSheet = nil
        opened = route
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            SkeletonRows(label: catalog[.commonLoading], id: "clients.loading")
                .listRowSeparator(.hidden)
            if model.loadingSlow {
                StatusMessage(text: catalog[.commonLoadingSlow], kind: .info, id: "clients.loadingSlow")
            }
        case .failed:
            failure
        case .noPermission:
            StatusMessage(text: catalog[.noPermissionTitle], kind: .info, id: "clients.noPermissionTitle")
                .accessibilityAddTraits(.isHeader)
            StatusMessage(text: model.noPermissionText, kind: .info, id: "clients.noPermission")
        case .loaded:
            loaded
        }
    }

    @ViewBuilder private var loaded: some View {
        if let offline = model.offlineText {
            StatusMessage(text: offline, kind: .info, id: "clients.offline")
        }
        if model.loadFailed { failure }
        if model.clients.isEmpty {
            emptyState
        } else {
            ForEach(model.clients, id: \.id) { client in
                row(client)
            }
            if model.hasMore {
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(catalog[.commonLoading])
                    .accessibilityIdentifier("clients.loadingMore")
            }
        }
    }

    private var failure: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            StatusMessage(text: catalog[.clientsLoadError], kind: .error, id: "clients.error")
            Button {
                Task { await model.load() }
            } label: {
                Text(catalog[.commonRetry])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.primaryAction)
            .accessibilityIdentifier("clients.retry")
        }
    }

    /// "Nog geen klanten. Voeg je eerste klant toe." with the add action, or "Geen klanten gevonden." for a search.
    @ViewBuilder private var emptyState: some View {
        if model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
                Text(catalog[.clientsEmpty])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("clients.empty")
            }
        } else {
            Text(catalog[.clientsNoResults])
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("clients.noResults")
        }
    }

    private func row(_ client: Components.Schemas.Client) -> some View {
        Button {
            opened = ClientRoute(client: client)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                    Text(client.name)
                        .font(.system(Tokens.TextStyle.body))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("clients.rowName.\(client.id)")
                    Text(client.email)
                        .font(.system(Tokens.TextStyle.label))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("clients.rowEmail.\(client.id)")
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(Tokens.Colors.fillDecorative)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("clients.row.\(client.id)")
        .task { await model.loadMore(after: client) }
    }
}
