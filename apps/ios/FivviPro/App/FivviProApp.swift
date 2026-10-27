import OpenAPIURLSession
import SwiftUI
import FivviAPI
import FivviDesignTokens

@main
struct FivviProApp: App {
    @State private var session: Session
    private let api: Client
    private let store: KeychainSessionStore
    private let catalog: Catalog

    init() {
        ErrorReporting.start()
        let store = KeychainSessionStore()
        store.clearLeftoverTokenAtFirstLaunch()
        UITestSession.apply(to: store)
        let session = Session(store: store, onSignedOut: ErrorReporting.clearUser)
        let auth = AuthMiddleware(store: store) { await session.tokenRejected() }
        api = Client(serverURL: AppConfiguration.apiBaseURL(), transport: URLSessionTransport(), middlewares: [auth])
        catalog = Catalog(locale: InterfaceLanguage.resolve(.forLaunch()))
        self.store = store
        _session = State(initialValue: session)
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session, api: api, store: store, catalog: catalog)
                .tint(Tokens.Colors.actionPrimaryBg)
                .preferredColorScheme(LaunchAppearance.colorScheme())
        }
    }
}
