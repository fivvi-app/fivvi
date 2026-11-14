import SwiftUI
import FivviSignIn
import FivviStrings

/// The Fivvi Pro day dial on the sign-in screens (E020 #629, DECISIONS.md §2): the brand files
/// `docs/design/brand/day-dial/b2-pro/fivvi-day-dial-b2-pro-{light,dark}.svg`, copied unchanged into the asset
/// `ProLogo` (light in light mode, dark in dark mode). It is an image in the screen, independent of the app icon.
enum ProLogo {
    static let assetName = "ProLogo"

    /// The image with its accessible name, the app's name (*Fivvi Pro*).
    static func logo(catalog: Catalog) -> SignInLogo {
        SignInLogo(image: Image(assetName), label: catalog[.appName])
    }
}
