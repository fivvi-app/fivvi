import SwiftUI
import FivviDesignTokens

/// The title of a screen (E020 AC8): the large title at 34 pt (`Tokens.TextStyle.display`) in bold, with the date in
/// capitals above it where the prototype has one (*Vandaag*) and a line under it.
struct LargeTitleHeader: View {
    let title: String
    var eyebrow: String?
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let eyebrow {
                Text(eyebrow)
                    .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.26)
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityIdentifier("largeTitle.eyebrow")
            }
            Text(title)
                .font(.system(Tokens.TextStyle.display, weight: .bold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("largeTitle.title")
            if let subtitle {
                Text(subtitle)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Spacing.space5)
        .padding(.top, 6)
        .padding(.bottom, 14)
    }
}

/// A screen that scrolls under a navigation bar, with its large title at the top (E020 AC8). Once the title has
/// scrolled away, the bar shows it inline, as in the prototype. The bar's buttons, the tab bar and any sheet are the
/// system's, so they are Liquid Glass without anything here drawing it.
struct LargeTitleScreen<Content: View>: View {
    let title: String
    var eyebrow: String?
    var subtitle: String?
    @ViewBuilder let content: Content
    @State private var titleScrolledAway = false

    var body: some View {
        InsetGroupedList {
            LargeTitleHeader(title: title, eyebrow: eyebrow, subtitle: subtitle)
        } content: {
            content
        }
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y + geometry.contentInsets.top > 40
        } action: { _, scrolledAway in
            titleScrolledAway = scrolledAway
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(title)
                    .font(.system(Tokens.TextStyle.headline))
                    .opacity(titleScrolledAway ? 1 : 0)
                    .accessibilityHidden(!titleScrolledAway)
            }
        }
    }
}
