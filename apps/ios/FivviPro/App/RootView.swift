import SwiftUI
import FivviAPI

/// The screen the app opens on: the signed-in home with a token, TM-01 without one. The session decides; nothing here
/// calls an authenticated route to find out (F001 AC13).
struct RootView: View {
    let session: Session
    let api: any APIProtocol
    let store: any SessionStore
    let catalog: Catalog
    /// The API's base URL; trainer web is on the same host.
    var apiBaseURL = AppConfiguration.apiBaseURL()

    var body: some View {
        switch session.state {
        case let .signedOut(afterRejection):
            SignInView(api: api, store: store, catalog: catalog, afterRejection: afterRejection) { session.signedIn() }
        case .signedIn:
            HomeView(
                api: api, store: store, catalog: catalog,
                welcomeURL: AppConfiguration.welcomeURL(apiBaseURL: apiBaseURL), onAccount: ErrorReporting.setUser,
                onSignedOut: { session.signedOut(afterRejection: $0) }
            )
        }
    }
}
