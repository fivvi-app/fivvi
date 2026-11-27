import OpenAPIURLSession
import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviSession
import FivviLanguage
import FivviUI
import FivviObservability

@main
struct FivviProApp: App {
    @State private var session: Session
    private let api: Client
    private let store: KeychainSessionStore
    private let language: AppLanguage
    private let files: PhoneFiles
    /// Whether the phone is online (the network path, or a fixed answer in a UI test): *Annuleren* is off without it.
    @State private var connectivity: Connectivity

    init() {
        ErrorReporting.start()
        let store = KeychainSessionStore()
        store.clearLeftoverTokenAtFirstLaunch()
        UITestSession.apply(to: store) { defaults in
            // A test starts from a phone with no language choice either (F010), and one that remembers no workspace
            // (F012).
            AppLanguage.forgetChoice(defaults: defaults)
            CurrentWorkspaceStore.forget(defaults: defaults)
            FilePersonalStore.shared.clear()
            FilePersonalStore.attendance.clear()
        }
        let signIn = AppSignIn(store: store)
        let session = signIn.session
        files = signIn.files
        api = Client(
            serverURL: AppConfiguration.apiBaseURL(), configuration: AppConfiguration.clientConfiguration,
            transport: URLSessionTransport(), middlewares: [signIn.auth]
        )
        language = AppLanguage(api: api, store: store)
        self.store = store
        _session = State(initialValue: session)
        let connectivity = Connectivity.forLaunch()
        connectivity.start()
        _connectivity = State(initialValue: connectivity)
    }

    var body: some Scene {
        WindowGroup {
            root
                .tint(Tokens.Colors.actionPrimaryBg)
                .preferredColorScheme(LaunchAppearance.colorScheme())
            #if DEBUG
                .recordingOpenedLinks()
                .showingRenderCounts()
            #endif
        }
    }

    @ViewBuilder private var root: some View {
        #if DEBUG
            if KitGallery.isRequested() {
                KitGalleryView(catalog: language.catalog)
            } else {
                RootView(
                    session: session, api: api, store: store, language: language, connectivity: connectivity,
                    files: files
                )
            }
        #else
            RootView(
                session: session, api: api, store: store, language: language, connectivity: connectivity, files: files
            )
        #endif
    }
}
