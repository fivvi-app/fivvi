import SwiftUI
import FivviDesignTokens

public enum PersonAvatarMetrics {
    /// The avatar of a list row (the prototype's `.av`: 40 pt).
    public static let row: CGFloat = 40
    /// The avatar at the top of a profile (the prototype's `.av.lg`: 84 pt).
    public static let large: CGFloat = 84
    /// The initials are this share of the avatar's diameter (15 pt in 40, 32 pt in 84, rounded to one share).
    static let letterShare: CGFloat = 0.38

    /// The letters of a person's avatar: the first letter of the first and of the last word of the name, in capitals;
    /// one word gives one letter, no name none.
    public static func initials(of name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        guard let first = words.first?.first else { return "" }
        guard words.count > 1, let last = words.last?.first else { return String(first).uppercased() }
        return (String(first) + String(last)).uppercased()
    }
}

/// The avatar of a person, a client in a list or on a profile (E020, the prototype's `.av`): a circle with the person's
/// initials. The prototype draws white initials on a colour per client; white on a client colour has no 4.5:1, so the
/// avatar takes the private session's gradient (`sessionPrivateGradientTop` to `...Bottom`, one hue) with its
/// on-solid text, the pair of `NextCard`'s private tone that `contrast-pairs.json` declares. Decorative: the row or
/// the heading beside it names the person. It scales with the text size, like the text in the row.
public struct PersonAvatar: View {
    public init(name: String, size: CGFloat = PersonAvatarMetrics.row) {
        self.name = name
        _diameter = ScaledMetric(wrappedValue: size, relativeTo: .body)
    }
    public let name: String
    @ScaledMetric private var diameter: CGFloat

    public var body: some View {
        Text(PersonAvatarMetrics.initials(of: name))
            .font(.system(size: diameter * PersonAvatarMetrics.letterShare, weight: .semibold))
            .foregroundStyle(Tokens.Colors.sessionPrivateOnSolid)
            .frame(width: diameter, height: diameter)
            .background(
                LinearGradient(
                    colors: [Tokens.Colors.sessionPrivateGradientTop, Tokens.Colors.sessionPrivateGradientBottom],
                    startPoint: .top, endPoint: .bottom
                ),
                in: Circle()
            )
            .accessibilityHidden(true)
    }
}
