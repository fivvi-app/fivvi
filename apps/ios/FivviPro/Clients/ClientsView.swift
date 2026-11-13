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

/// *Klanten* / *Clients* (TM-02, F006, E020): the large title, the search field under it, and the clients sorted by name
/// as avatar rows (name, email address, chevron) in one rounded group on the grouped canvas; pull to refresh; *+ Nieuwe
/// klant* in the navigation bar, as the prototype's action, when the capability helper allows `clients.manage`. A row
/// opens TM-03. Skeleton rows load, a failure says so with *Opnieuw proberen*, and a phone without a connection keeps
/// the list it has with its age.
struct ClientsView: View {
    let model: ClientsViewModel
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    /// Opens TM-03 for a client. The home's navigation stack owns the screen, as it owns this one: a destination
    /// declared here, on a screen the stack pushed, made the stack resolve its destinations again on every update while
    /// a profile opened by ID was loading (#684).
    let onOpen: (ClientRoute) -> Void
    @State private var searchText = ""
    @State private var newClient: ClientFormViewModel?
    /// The client to open once the sheet that added or found them is gone.
    @State private var afterSheet: ClientRoute?
    /// The avatar of a row; it grows with the text size, and the separators start after it.
    @ScaledMetric(relativeTo: .body) private var avatar = PersonAvatarMetrics.row

    private var catalog: Catalog { model.catalog }

    var body: some View {
        LargeTitleScreen(title: catalog[.clientsTitle], titleIdentifier: "clients.title") {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space6) {
                SearchPill(
                    text: $searchText, prompt: catalog[.clientsSearchPlaceholder], identifier: "clients.search"
                )
                .tint(Tokens.Colors.accentText)
                content
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("clients.list")
        }
        // Scrolling puts the keyboard of the search field away at once; a tap elsewhere would open a row.
        .scrollDismissesKeyboard(.immediately)
        .toolbar {
            if capabilities.allows(.clients_manage) {
                ToolbarItem(placement: .primaryAction) { newClientButton }
            }
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
        .environment(\.locale, catalog.formattingLocale)
        .countingRenders("ClientsView")
    }

    /// Typing waits a moment for the next letter; coming back to the screen reads the list again at once.
    private func searchChanged() async {
        if searchText != model.query {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
        }
        await model.search(searchText)
    }

    /// The prototype's action: a prominent glass button in the bar with a person and a plus (`.gb.prom`). Its name is the
    /// text, which the icon-only label keeps for VoiceOver.
    private var newClientButton: some View {
        Button {
            newClient = model.newClientForm()
        } label: {
            Label(catalog[.clientsNewClient], systemImage: "person.badge.plus")
        }
        .buttonStyle(.glassProminent)
        .tint(Tokens.Colors.accentFill)
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
        onOpen(route)
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            InsetGroup {
                SkeletonRows(label: catalog[.commonLoading], id: "clients.loading")
                    .insetRowLayout()
            }
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
            InsetGroup(separatorInset: Tokens.Spacing.space4 + avatar + Tokens.Spacing.space3) {
                ForEach(model.clients, id: \.id) { client in
                    row(client)
                }
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
        InsetGroup {
            VStack(spacing: Tokens.Spacing.space4) {
                StatusMessage(text: catalog[.clientsLoadError], kind: .error, id: "clients.error")
                PillButtonStack {
                    Button {
                        Task { await model.load() }
                    } label: {
                        Text(catalog[.commonRetry])
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pill(.filled))
                    .accessibilityIdentifier("clients.retry")
                }
            }
            .insetRowLayout()
        }
    }

    /// "Nog geen klanten. Voeg je eerste klant toe." or "Geen klanten gevonden." for a search.
    @ViewBuilder private var emptyState: some View {
        if model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            InsetGroup {
                Text(catalog[.clientsEmpty])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .insetRowLayout()
                    .accessibilityIdentifier("clients.empty")
            }
        } else {
            InsetGroup {
                Text(catalog[.clientsNoResults])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .insetRowLayout()
                    .accessibilityIdentifier("clients.noResults")
            }
        }
    }

    private func row(_ client: Components.Schemas.Client) -> some View {
        Button {
            onOpen(ClientRoute(client: client))
        } label: {
            HStack(spacing: Tokens.Spacing.space3) {
                PersonAvatar(name: client.name)
                VStack(alignment: .leading, spacing: 2) {
                    Text(client.name)
                        .font(.system(Tokens.TextStyle.body, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("clients.rowName.\(client.id)")
                    Text(client.email)
                        .font(.system(Tokens.TextStyle.subhead))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("clients.rowEmail.\(client.id)")
                }
                Spacer(minLength: Tokens.Spacing.space2)
                Image(systemName: "chevron.forward")
                    .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.fillDecorative)
                    .accessibilityHidden(true)
            }
            .multilineTextAlignment(.leading)
            .insetRowLayout()
        }
        .buttonStyle(.insetRow)
        .accessibilityIdentifier("clients.row.\(client.id)")
        .task { await model.loadMore(after: client) }
    }
}
