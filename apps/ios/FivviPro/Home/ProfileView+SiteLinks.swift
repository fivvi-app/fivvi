import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// A row of *Profiel* that opens a page of the website (F064 AC17): its test id, its text and the address.
struct SiteLinkRow: Equatable, Identifiable {
    let id: String
    let title: String
    let url: URL

    /// *Hulp en contact* and then *Privacyverklaring*, in the language of `catalog`.
    static func rows(catalog: Catalog) -> [SiteLinkRow] {
        let locale = catalog.locale
        return [
            SiteLinkRow(id: "profile.support", title: catalog[.profileSupport], url: SiteLinks.url(.support, locale)),
            SiteLinkRow(id: "profile.privacy", title: catalog[.profilePrivacy], url: SiteLinks.url(.privacy, locale))
        ]
    }
}

/// The group under *Taal* with *Hulp en contact* and *Privacyverklaring* (F064 AC17, TM-04): no section title and no
/// chevron, like the prototype's link rows. A tap opens the page in the system browser through `openLink`.
extension ProfileView {
    var siteLinksSection: some View {
        InsetGroup {
            ForEach(SiteLinkRow.rows(catalog: model.catalog)) { row in
                Button {
                    openLink(row.url)
                } label: {
                    InsetRow(title: row.title)
                }
                .buttonStyle(.insetRow)
                .accessibilityAddTraits(.isLink)
                .accessibilityIdentifier(row.id)
            }
        }
    }
}
