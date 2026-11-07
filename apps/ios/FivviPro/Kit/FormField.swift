import SwiftUI
import FivviDesignTokens

enum FieldErrorStyle {
    /// The icon in front of a field's error message.
    static let systemImage = "exclamationmark.triangle.fill"
}

/// What a screen reader and Voice Control get of a `FormField`: one element, the field. Its label carries the error
/// after the label, so it is read once, and its value stays what the person typed. Voice Control keeps the short name.
enum FieldAccessibility {
    static func label(_ label: String, error: String?) -> String {
        error.map { "\(label), \($0)" } ?? label
    }

    static func inputLabels(_ label: String) -> [String] { [label] }
}

/// A field with its label and its error state (E020 AC14, DECISIONS.md §2): with an `error`, the field turns red (a
/// danger tint and a red label), a warning icon and the message show under it, and a screen reader reads the message
/// after the field's label (`FieldAccessibility`). Put it in an `InsetGroup`; the field itself is any control, usually
/// a `TextField` in the plain style.
struct FormField<Field: View>: View {
    let label: String
    var error: String?
    @ViewBuilder let field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(label)
                .font(.system(Tokens.TextStyle.footnote))
                .foregroundStyle(error == nil ? Tokens.Colors.textSecondary : Tokens.Colors.statusDangerText)
                // The field's own label says it, so the visible text isn't a second element to read.
                .accessibilityHidden(true)
            field
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .frame(minHeight: 28)
                // The error is read with the label, so the field's value stays what the person typed.
                .accessibilityLabel(FieldAccessibility.label(label, error: error))
                .accessibilityInputLabels(FieldAccessibility.inputLabels(label))
            if let error {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: FieldErrorStyle.systemImage)
                        .imageScale(.small)
                        .foregroundStyle(Tokens.Colors.statusDangerFg)
                        .accessibilityHidden(true)
                    Text(error)
                        .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.statusDangerText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, Tokens.Spacing.space4)
        .padding(.vertical, Tokens.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(error == nil ? Color.clear : Tokens.Colors.statusDangerBg)
    }
}
