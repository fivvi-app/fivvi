import Foundation
import Observation
import FivviAPI
import FivviStrings

/// *Klanten* / *Clients* (TM-02): the workspace's clients from `GET /api/v1/workspaces/{id}/clients` through the
/// generated client (F006 AC6, AC12). The server sorts them by name, searches them (part of a name or an email address,
/// case and accents ignored) and pages them; the app holds no rule about who may see what, the answers do. What was
/// shown stays when a later request fails, with the age of the list when the phone is offline
/// (`information-architecture.md §9.5`). The list is kept in memory only: no client data is written to the phone.
@MainActor
@Observable
final class ClientsViewModel {
    typealias Client = Components.Schemas.Client

    enum State: Equatable {
        /// Nothing to show yet: the screen shows skeleton rows.
        case loading
        case loaded
        /// The first request failed (or answered something unexpected): the error and *Opnieuw proberen*.
        case failed
        /// The API refused the clients of this workspace: the no-permission state.
        case noPermission
    }

    private(set) var state = State.loading
    private(set) var clients: [Client] = []
    /// How many clients match the search, over all pages.
    private(set) var total = 0
    /// What the search field holds now.
    private(set) var query = ""
    /// A request failed while the list is shown, but not for lack of a connection: the screen says so above the list.
    private(set) var loadFailed = false
    /// The skeleton rows have been shown for `slowAfter` (10 s): the screen adds "Dit duurt langer dan normaal…"
    /// (`information-architecture.md §9.5`).
    private(set) var loadingSlow = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    private let api: any APIProtocol
    private let pageSize: Int
    private let now: () -> Date
    private let clock: any Clock<Duration>
    private let slowAfter: Duration
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void
    /// When the list on screen was last read, and whether the phone couldn't reach the API since.
    private var updatedAt: Date?
    private var offline = false
    /// Counts the reads, so the answer to an older one (an earlier search) is dropped.
    private var generation = 0
    /// How many pages of the current search are in the list.
    private var pagesLoaded = 0

    /// `onForbidden` is told the capability the API refused with `403`; the app's capability helper then hides the
    /// action. Times are shown in the workspace's time zone. `clock` times the "this is taking longer" line.
    init(
        api: any APIProtocol, workspace: CurrentWorkspace, catalog: Catalog, pageSize: Int = 50,
        now: @escaping () -> Date = Date.init, clock: any Clock<Duration> = ContinuousClock(),
        slowAfter: Duration = .seconds(10),
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.catalog = catalog
        self.pageSize = pageSize
        self.now = now
        self.clock = clock
        self.slowAfter = slowAfter
        self.onForbidden = onForbidden
    }

    /// More clients match than are listed.
    var hasMore: Bool { clients.count < total }

    /// *Je bent offline. Laatst bijgewerkt om 08:42.* while the list shown couldn't be refreshed for lack of a
    /// connection.
    var offlineText: String? {
        guard offline, let updatedAt else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = workspace.timeZone
        formatter.dateFormat = "HH:mm"
        return catalog.string(.clientsOffline, formatter.string(from: updatedAt))
    }

    /// *Je hebt geen toegang tot deze pagina. Vraag de eigenaar van John's Gym.*
    var noPermissionText: String { catalog.string(.noPermissionBody, workspace.name) }

    /// Runs while the screen shows the skeleton rows: after `slowAfter` it sets `loadingSlow`. Cancelled, or started
    /// when nothing is loading, it clears it.
    func watchSlowLoading() async {
        loadingSlow = false
        guard state == .loading else { return }
        guard (try? await clock.sleep(for: slowAfter)) != nil, state == .loading else { return }
        loadingSlow = true
    }

    /// Starts again, with skeleton rows: the first read, and *Opnieuw proberen*.
    func load() async {
        state = .loading
        await read(search: query)
    }

    /// Reads the list again and leaves what is on screen until the answer is there: pull to refresh, coming back to the
    /// app or to the screen.
    func refresh() async {
        await read(search: query)
    }

    /// Searches as the person types: the list stays until the answer arrives. Blank is no search.
    func search(_ text: String) async {
        query = text
        await read(search: text)
    }

    /// The row `client` came on screen: when it is the last one and more match, the next page is added.
    func loadMore(after client: Client) async {
        guard client.id == clients.last?.id, hasMore, state == .loaded else { return }
        generation += 1
        let mine = generation
        let search = query
        switch await fetch(page: pagesLoaded + 1, search: search) {
        case let .success(list):
            guard mine == generation else { return }
            clients += list.items.filter { new in !clients.contains { $0.id == new.id } }
            total = list.total
            pagesLoaded += 1
            succeeded()
        case let .failure(error):
            guard mine == generation else { return }
            failed(error)
        }
    }

    /// The client was added: it is in the list at once, in the order of the names.
    func didAdd(_ client: Client) {
        guard !clients.contains(where: { $0.id == client.id }) else { return didChange(client) }
        clients.append(client)
        sortByName()
        total += 1
    }

    /// The client was changed: the row shows the change at once.
    func didChange(_ client: Client) {
        guard let index = clients.firstIndex(where: { $0.id == client.id }) else { return }
        clients[index] = client
        sortByName()
    }

    /// The interface language changed: the texts are in it at once.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
    }

    /// The model of the profile of `client` (TM-03); `justAdded` shows the confirmation of an addition.
    func profile(of client: Client, justAdded: Bool = false) -> ClientProfileViewModel {
        ClientProfileViewModel(
            api: api, workspace: workspace, client: client, catalog: catalog, justAdded: justAdded,
            onChange: { [weak self] in self?.didChange($0) }, onForbidden: onForbidden
        )
    }

    /// The model of the profile of the client with this ID, whose data is not at hand (it is read first).
    func profile(id: String) -> ClientProfileViewModel {
        ClientProfileViewModel(
            api: api, workspace: workspace, clientID: id, catalog: catalog,
            onChange: { [weak self] in self?.didChange($0) }, onForbidden: onForbidden
        )
    }

    /// The model of the form that adds a client (*+ Nieuwe klant*).
    func newClientForm() -> ClientFormViewModel {
        ClientFormViewModel(api: api, workspace: workspace, catalog: catalog, mode: .add, onForbidden: onForbidden)
    }

    // MARK: Reading

    private func read(search: String) async {
        generation += 1
        let mine = generation
        switch await fetch(page: 1, search: search) {
        case let .success(list):
            guard mine == generation else { return }
            clients = list.items
            total = list.total
            pagesLoaded = 1
            state = .loaded
            succeeded()
        case let .failure(error):
            guard mine == generation else { return }
            failed(error)
        }
    }

    private func fetch(page: Int, search: String) async -> Result<Components.Schemas.ClientList, ClientRequestError> {
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let output = try await api.listClients(.init(
                path: .init(workspaceId: workspace.id),
                query: .init(search: trimmed.isEmpty ? nil : trimmed, pageSize: pageSize, page: page)
            ))
            switch output {
            case let .ok(page): return .success(try page.body.json)
            case .forbidden:
                await onForbidden(.clients_view)
                return .failure(.noPermission)
            case .notFound: return .failure(.noPermission)
            default: return .failure(.failed)
            }
        } catch {
            return .failure(ClientRequestError(thrown: error))
        }
    }

    private func succeeded() {
        updatedAt = now()
        offline = false
        loadFailed = false
    }

    private func failed(_ error: ClientRequestError) {
        switch error {
        case .cancelled:
            break
        case .noPermission:
            state = .noPermission
        case .offline, .failed:
            guard state == .loaded else {
                state = .failed
                return
            }
            offline = error == .offline
            loadFailed = error == .failed
        }
    }

    private func sortByName() {
        clients.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}
