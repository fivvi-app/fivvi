import SwiftUI
import FivviAPI
import FivviSession
import FivviLanguage
import FivviSignIn
import FivviUI
import FivviObservability

/// The screen the app opens on: the tabs with a token, the sign-in without one. The session decides; nothing here calls an
/// authenticated route to find out (F001 AC13). A join or invitation link covers the tabs (E017 #505).
struct RootView: View {
    let session: Session
    let api: any APIProtocol
    let store: any SessionStore
    let language: AppLanguage
    let connectivity: Connectivity
    let links: LinkInbox

    var body: some View {
        switch session.state {
        case let .signedOut(afterRejection):
            SignInView(
                api: api, store: store, language: language, afterRejection: afterRejection,
                logo: { ClientLogo.logo(catalog: $0) },
                onSignedIn: { session.signedIn() }
            )
        case .signedIn:
            ClientTabsView(
                api: api, store: store, language: language, connectivity: connectivity,
                onAccount: ErrorReporting.setUser,
                onSignedOut: { session.signedOut(afterRejection: $0) }
            )
            // A join or invitation link opened the app: its screen covers the tabs until the person goes back (F029 and
            // F032 give it their screens). A link that arrived while signed out waits in `links` through the sign-in.
            .fullScreenCover(item: Binding(get: { links.link }, set: { if $0 == nil { links.dismiss() } })) { link in
                LinkView(link: link, catalog: language.catalog, onBack: links.dismiss)
            }
        }
    }
}
