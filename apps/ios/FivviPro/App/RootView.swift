import SwiftUI
import FivviAPI
import FivviSession
import FivviLanguage
import FivviUI
import FivviSignIn
import FivviObservability

/// The screen the app opens on: the signed-in home with a token, TM-01 without one. The session decides; nothing here
/// calls an authenticated route to find out (F001 AC13).
struct RootView: View {
    let session: Session
    let api: any APIProtocol
    let store: any SessionStore
    let language: AppLanguage
    let connectivity: Connectivity
    /// The files of the phone: the home keeps what the personal screens and the attendance queue need in the same ones
    /// the sign-out and a rejected token act on (`AppSignIn`).
    var files = PhoneFiles.live
    /// The API's base URL; trainer web is on the same host.
    var apiBaseURL = AppConfiguration.apiBaseURL()

    var body: some View {
        switch session.state {
        case let .signedOut(afterRejection):
            SignInView(
                api: api, store: store, language: language, afterRejection: afterRejection,
                logo: { ProLogo.logo(catalog: $0) },
                onSignedIn: { session.signedIn() }
            )
        case .signedIn:
            HomeView(
                api: api, store: store, language: language, connectivity: connectivity,
                welcomeURL: AppConfiguration.welcomeURL(apiBaseURL: apiBaseURL), onAccount: ErrorReporting.setUser,
                onSignedOut: { session.signedOut(afterRejection: $0) }, files: files
            )
        }
    }
}
