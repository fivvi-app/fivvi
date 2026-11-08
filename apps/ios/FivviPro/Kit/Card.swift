import SwiftUI
import FivviDesignTokens

enum CardStyle {
    /// A card's corner radius on iOS and the web (`radius.card`; Android uses 28).
    static let radius = Tokens.Radius.card
    /// The space between a card's edge and its content.
    static let padding = Tokens.Spacing.space4
}

/// A card: the surface colour, rounded at the card radius, with continuous corners (E020 AC14). Cards sit on the grouped
/// canvas; a list of rows is an `InsetGroup`, which has the same shape.
struct Card<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(CardStyle.padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Tokens.Colors.bgSurface,
                in: RoundedRectangle(cornerRadius: CardStyle.radius, style: .continuous)
            )
    }
}
