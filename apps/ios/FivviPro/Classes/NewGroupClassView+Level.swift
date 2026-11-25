import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviUI

extension NewGroupClassView {
    /// *Niveau* (F067): *Geen* to start with, then *Alle niveaus*, *Beginner*, *Gemiddeld* and *Gevorderd*.
    var levelRow: some View {
        HStack {
            Text(model.levelLabel)
                .foregroundStyle(Tokens.Colors.textPrimary)
            Spacer(minLength: Tokens.Spacing.space2)
            Picker(model.levelLabel, selection: $model.level) {
                ForEach(model.levelOptions, id: \.level) { option in
                    Text(option.text).tag(option.level)
                }
            }
            .labelsHidden()
            .accessibilityIdentifier("newClass.level")
        }
        .insetRowLayout()
    }
}
