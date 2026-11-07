import SwiftUI
import FivviDesignTokens

enum FieldErrorStyle {
    /// The icon in front of a field's error message.
    static let systemImage = "exclamationmark.triangle.fill"
}

/// A field with its label and its error state (E020 AC14, DECISIONS.md §2): with an `error`, the field turns red (a
/// danger tint and a red label), a warning icon and the message show under it, and a screen reader reads the message
/// after the field's label. Put it in an `InsetGroup`; the field itself is any control, usually a `TextField` in the plain style.
struct FormField<Field: View>: View {
    let label: String
    var error: String?
    @ViewBuilder let field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(label)
                .font(.system(Tokens.TextStyle.footnote))
                .foregroundStyle(error == nil ? Tokens.Colors.textSecondary : Tokens.Colors.statusDangerText)
            field
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .frame(minHeight: 28)
                // The error is read with the label, so the field's value stays what the person typed.
                .accessibilityLabel(error.map { "\(label), \($0)" } ?? label)
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
                        .accessibilityIdentifier("field.error")
                }
            }
        }
        .padding(.horizontal, Tokens.Spacing.space4)
        .padding(.vertical, Tokens.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(error == nil ? Color.clear : Tokens.Colors.statusDangerBg)
    }
}
