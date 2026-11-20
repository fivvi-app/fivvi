import OpenAPIURLSession
import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviSession
import FivviLanguage
import FivviUI
import FivviObservability

/// The client app Fivvi (`app.fivvi`, E017 #503, spec #469): the sign-in with the emailed code, then the tabs *Home ·
/// Boeken · Profiel*. It is built on the same shared packages as Fivvi Pro (`Packages/FivviShared`) and has its own
/// Keychain service, icon and name.
@main
struct FivviApp: App {
    @State private var session: Session
    @State private var connectivity: Connectivity
    private let api: Client
    private let store: KeychainSessionStore
    private let language: AppLanguage

    init() {
        ErrorReporting.start()
        let store = KeychainSessionStore(service: AppConfiguration.keychainService)
        store.clearLeftoverTokenAtFirstLaunch()
        // A test starts from a phone with no language choice either (F010).
        UITestSession.apply(to: store) { AppLanguage.forgetChoice(defaults: $0) }
        let session = Session(store: store, onSignedOut: ErrorReporting.clearUser)
        let auth = AuthMiddleware(store: store) { await session.tokenRejected() }
        api = Client(serverURL: AppConfiguration.apiBaseURL(), transport: URLSessionTransport(), middlewares: [auth])
        language = AppLanguage(api: api, store: store)
        let connectivity = Connectivity.forLaunch()
        connectivity.start()
        self.store = store
        _session = State(initialValue: session)
        _connectivity = State(initialValue: connectivity)
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session, api: api, store: store, language: language, connectivity: connectivity)
                .tint(Tokens.Colors.actionPrimaryBg)
                .preferredColorScheme(LaunchAppearance.colorScheme())
        }
    }
}
