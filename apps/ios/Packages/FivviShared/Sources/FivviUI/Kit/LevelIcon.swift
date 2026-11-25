import SwiftUI
import UIKit
import FivviAPI
import FivviDesignTokens
import FivviStrings

/// The level of a class as three bars of rising height (F067), filled by level (1 *Beginner*, 2 *Gemiddeld*, 3
/// *Gevorderd*; *Alle niveaus* all three at the same weight), in the tokens' secondary text colour (a pair of the
/// contrast check, `native-secondary-text`). The level is its accessible name, *Niveau: Gevorderd*, never colour alone.
/// Three forms: `compact` for the rows of a list is the bars only and draws nothing for *Alle niveaus*; `full` for a page
/// about one class has the word beside the bars; `bars` is the bars only for every level, for where the word is already
/// next to them (the eyebrow of TD-03). A class without a level (*Geen*) is not drawn: callers pass nil and nothing is left.
public struct LevelIcon: View {
    public enum Form: Sendable {
        case compact, full, bars
    }

    public init(level: Components.Schemas.ClassLevel, catalog: Catalog, form: Form, identifier: String = "levelIcon") {
        self.level = level
        self.catalog = catalog
        self.form = form
        self.identifier = identifier
    }

    public let level: Components.Schemas.ClassLevel
    public let catalog: Catalog
    public let form: Form
    public let identifier: String

    /// Whether the icon draws anything: a compact one not for *Alle niveaus*.
    public static func isShown(_ level: Components.Schemas.ClassLevel, in form: Form) -> Bool {
        form != .compact || level.showsInList
    }

    public var body: some View {
        if Self.isShown(level, in: form) {
            HStack(spacing: Tokens.Spacing.space2) {
                LevelBars(filled: level.filledBars)
                if form == .full {
                    Text(catalog.levelWord(level))
                        .font(.system(Tokens.TextStyle.subhead))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(catalog.levelAccessibleName(level))
            .accessibilityAddTraits(.isImage)
            .accessibilityIdentifier(identifier)
        }
    }

    /// A non-breaking space: the bars never start a line of their own.
    private static let gap = "\u{00A0}"

    /// A class name with the compact icon right after it, for a row (F067): the bars are part of the text, so a long name
    /// wraps and they stay with its last word, and nothing is cut off. The name alone where a row shows no icon (*Alle
    /// niveaus*, *Geen*). `scale` sizes the bars with the text; the bars take the text's own colour, the caller sets it.
    @MainActor
    public static func row(name: Text, level: Components.Schemas.ClassLevel?, scale: CGFloat) -> Text {
        guard let level, isShown(level, in: .compact) else { return name }
        let image = LevelBars.image(filled: level.filledBars, unit: scale)
        return name + Text(verbatim: gap) + Text(Image(uiImage: image).renderingMode(.template))
            .foregroundStyle(Tokens.Colors.textSecondary)
    }
}

/// The geometry of the bars: widths and heights in points (5, 8 and 11 high, 3 wide, 2 apart), the unfilled ones faded.
enum LevelBarsMetrics {
    static let heights: [CGFloat] = [5, 8, 11]
    static let width: CGFloat = 3
    static let gap: CGFloat = 2
    static let radius: CGFloat = 1
    static let unfilledOpacity = 0.3
}

struct LevelBars: View {
    let filled: Int
    /// 1 draws the bars at their size in points; a row scales them with its text.
    var unit: CGFloat = 1

    var body: some View {
        HStack(alignment: .bottom, spacing: LevelBarsMetrics.gap * unit) {
            ForEach(0..<LevelBarsMetrics.heights.count, id: \.self) { index in
                RoundedRectangle(cornerRadius: LevelBarsMetrics.radius * unit, style: .continuous)
                    .fill(Tokens.Colors.textSecondary)
                    .opacity(index < filled ? 1 : LevelBarsMetrics.unfilledOpacity)
                    .frame(width: LevelBarsMetrics.width * unit, height: LevelBarsMetrics.heights[index] * unit)
            }
        }
        .accessibilityHidden(true)
    }

    /// The bars as a template image (only its alpha counts, the unfilled bars faded): the colour comes from where it is
    /// drawn, so the text colour of a row tints it in light and dark.
    @MainActor
    static func image(filled: Int, unit: CGFloat) -> UIImage {
        let renderer = ImageRenderer(content: LevelBars(filled: filled, unit: unit))
        renderer.scale = 3
        return (renderer.uiImage ?? UIImage()).withRenderingMode(.alwaysTemplate)
    }
}
