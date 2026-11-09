import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// The sheet that changes the person's name on *Profiel* (TM-04, F005 AC1): *Annuleren* and *Opslaan* in the bar on top, so
/// the keyboard never covers them, and the field below. Nothing is checked here: the API's refusal words the field
/// message, and a failed save leaves what was typed. The sheet closes only once the API accepted, and can't be dismissed
/// or cancelled while the save is under way.
struct NameEditorView: View {
    let model: ProfileViewModel
    @FocusState private var focused: Bool

    private var saving: Bool { model.editor?.saving == true }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
                TextField(
                    model.catalog[.myProfileNameLabel],
                    text: Binding(get: { model.editor?.input ?? "" }, set: { model.enterName($0) })
                )
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .focused($focused)
                .disabled(saving)
                .onSubmit { Task { await model.saveName() } }
                .textFieldFrame()
                .accessibilityIdentifier("profile.nameInput")
                if let message = model.nameMessage {
                    Text(message)
                        .font(.system(Tokens.TextStyle.footnote))
                        .foregroundStyle(Tokens.Colors.statusDangerFg)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("profile.nameError")
                }
                Spacer(minLength: 0)
            }
            .padding(Tokens.Spacing.gutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Tokens.Colors.bgCanvas)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.catalog[.commonCancel]) { model.cancelEditingName() }
                        .disabled(saving)
                        .accessibilityIdentifier("profile.nameCancel")
                }
                ToolbarItem(placement: .principal) {
                    Text(model.catalog[.myProfileEditName])
                        .font(.headline)
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("profile.nameEditor")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.catalog[.myProfileSave]) { Task { await model.saveName() } }
                        .disabled(saving)
                        .accessibilityIdentifier("profile.nameSave")
                }
            }
        }
        .environment(\.locale, model.catalog.formattingLocale)
        .interactiveDismissDisabled(saving)
        .onAppear { focused = true }
    }
}
