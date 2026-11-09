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

    init() {
        ErrorReporting.start()
        let store = KeychainSessionStore()
        store.clearLeftoverTokenAtFirstLaunch()
        UITestSession.apply(to: store) { defaults in
            // A test starts from a phone with no language choice either (F010), and one that remembers no workspace
            // (F012).
            AppLanguage.forgetChoice(defaults: defaults)
            CurrentWorkspaceStore.forget(defaults: defaults)
        }
        let session = Session(store: store, onSignedOut: ErrorReporting.clearUser)
        let auth = AuthMiddleware(store: store) { await session.tokenRejected() }
        api = Client(serverURL: AppConfiguration.apiBaseURL(), transport: URLSessionTransport(), middlewares: [auth])
        language = AppLanguage(api: api, store: store)
        self.store = store
        _session = State(initialValue: session)
    }

    var body: some Scene {
        WindowGroup {
            root
                .tint(Tokens.Colors.actionPrimaryBg)
                .preferredColorScheme(LaunchAppearance.colorScheme())
            #if DEBUG
                .recordingOpenedLinks()
            #endif
        }
    }

    @ViewBuilder private var root: some View {
        #if DEBUG
            if KitGallery.isRequested() {
                KitGalleryView(catalog: language.catalog)
            } else {
                RootView(session: session, api: api, store: store, language: language)
            }
        #else
            RootView(session: session, api: api, store: store, language: language)
        #endif
    }
}
