import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings

extension Components.Schemas.Locale {
    /// The key of the language's own name ("Nederlands", "English"), the same in both catalogs.
    public var languageNameKey: StringKey {
        switch self {
        case .nlNL: .signInLanguageNl
        case .en: .signInLanguageEn
        }
    }
}

/// One language of the switch on TM-01: its own name, bold with an underline when it is the one shown, and a 44 pt
/// touch target. A screen reader hears it as selected.
public struct LanguageOptionButton: View {
    let title: String
    let isSelected: Bool
    let id: String
    let action: () -> Void

    public init(title: String, isSelected: Bool, id: String, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.id = id
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(Tokens.TextStyle.label, weight: isSelected ? .bold : .regular))
                .underline(isSelected)
                .foregroundStyle(isSelected ? Tokens.Colors.textPrimary : Tokens.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, Tokens.Spacing.space3)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(id)
    }
}
