import SwiftUI
import FivviSignIn
import FivviStrings

/// The plain day dial B2 on the sign-in screens (E017 #503, DECISIONS.md §2): the brand files
/// `docs/design/brand/day-dial/b2/fivvi-day-dial-b2-{light,dark}.svg`, copied unchanged into the asset `FivviLogo`
/// (light in light mode, dark in dark mode), never the Fivvi Pro dial with its PRO. It is an image in the screen,
/// independent of the app icon.
enum ClientLogo {
    static let assetName = "FivviLogo"

    /// The image with its accessible name, the app's name (*Fivvi*).
    static func logo(catalog: Catalog) -> SignInLogo {
        SignInLogo(image: Image(assetName), label: catalog[.appTitle])
    }
}
