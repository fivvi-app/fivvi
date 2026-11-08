import SwiftUI
import FivviDesignTokens

/// The title of a screen (E020 AC8): the large title at 34 pt (`Tokens.TextStyle.display`) in bold, with the date in
/// capitals above it where the prototype has one (*Vandaag*) and a line under it.
public struct LargeTitleHeader: View {
    public init(title: String, eyebrow: String? = nil, subtitle: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
        self.subtitle = subtitle
    }
    public let title: String
    public var eyebrow: String?
    public var subtitle: String?

    public var body: some View {
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
public struct LargeTitleScreen<Content: View>: View {
    public init(title: String, eyebrow: String? = nil, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.eyebrow = eyebrow
        self.subtitle = subtitle
        self.content = content()
    }
    public let title: String
    public var eyebrow: String?
    public var subtitle: String?
    @ViewBuilder public let content: Content

    public var body: some View {
        InsetGroupedList {
            LargeTitleHeader(title: title, eyebrow: eyebrow, subtitle: subtitle)
        } content: {
            content
        }
        .fivviCanvas()
        .inlineTitleOnceScrolledAway(title)
    }
}

extension View {
    /// The navigation bar shows `title` inline once the screen's scroll view has moved the large title out of sight,
    /// and nothing before that.
    public func inlineTitleOnceScrolledAway(_ title: String) -> some View {
        modifier(InlineTitleOnceScrolledAway(title: title))
    }
}

private struct InlineTitleOnceScrolledAway: ViewModifier {
    public let title: String
    @State private var scrolledAway = false

    public func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.y + geometry.contentInsets.top > 40
            } action: { _, scrolledAway in
                self.scrolledAway = scrolledAway
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            // The principal item takes the place of the system's inline title, so the bar shows nothing until the
            // large title has scrolled away. (`toolbar(removing: .title)` as well left the bar with no title at all,
            // also once scrolled away.)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .font(.system(Tokens.TextStyle.headline))
                        .opacity(scrolledAway ? 1 : 0)
                        // Read by VoiceOver once it shows; before that the system's own title reads the same.
                        .accessibilityLabel(scrolledAway ? title : "")
                        .accessibilityIdentifier("largeTitle.inline")
                }
            }
    }
}
