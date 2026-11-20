import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// Where a join link or an invitation link goes until F029 and F032 build their screens: "Deze link openen we binnenkort
/// in de app." with *Openen in de browser*, which opens the same address in the browser. A sub page, so it has a back
/// button in the navigation bar (DECISIONS.md section 5b); back returns to the tabs. F029 and F032 replace the case of
/// their destination. The ids are the Android test tags': `link.soon`, `link.openInBrowser`, `link.back`.
struct LinkView: View {
    let link: OpenedLink
    let catalog: Catalog
    let onBack: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            switch link.destination {
            case .join, .invitation:
                placeholder
            }
        }
    }

    private var placeholder: some View {
        InsetGroupedList {
            Card {
                Text(catalog[.appLinkSoon])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("link.soon")
            }
            PillButtonStack {
                Button {
                    openURL(link.url)
                } label: {
                    Text(catalog[.appLinkOpenInBrowser])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("link.openInBrowser")
            }
        }
        .padding(.top, Tokens.Spacing.space4)
        .fivviCanvas()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel(catalog[.appLinkBack])
                .accessibilityIdentifier("link.back")
            }
        }
    }
}
