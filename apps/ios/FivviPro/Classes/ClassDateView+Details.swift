import SwiftUI
import FivviDesignTokens
import FivviUI

/// The location and trainer rows of TD-03 (F021, F024: the trainer row of a substituted date reads *Mike (vervangt
/// Sarah)*).
extension ClassDateView {
    var locationRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            Text(model.locationName)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityIdentifier("classDate.location")
            Spacer(minLength: Tokens.Spacing.space2)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }

    var trainerRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "person")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.trainerLabel)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                Text(model.trainerText)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityIdentifier("classDate.trainer")
            }
            Spacer(minLength: Tokens.Spacing.space2)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }
}
