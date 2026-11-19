import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviUI

extension ClientFormViewModel: Identifiable {}

/// The form of a sheet that adds a client (*+ Nieuwe klant*) or edits one (*Bewerken*): *Naam* (focused, required) and
/// *E-mailadres* as the fields of one inset group, *Taal voor e-mails* with *Standaard (Nederlands)* preselected as a
/// group of its own, and *Annuleren* and the save button in the bar (F006 AC1 to AC3, AC7), where the keyboard doesn't
/// cover them. A field with a message turns red and shows it under it, and VoiceOver reads it after the field's label;
/// a failed save keeps the input; a duplicate email address offers the existing client. Text wraps, every control
/// keeps a 44 pt touch target. The test ids start with `idPrefix` (`clients.add` or `clientProfile.edit`), as on
/// Android.
struct ClientFormView: View {
    @Bindable var model: ClientFormViewModel
    let idPrefix: String
    /// The end of the save button's id: `submit` when adding, `save` when editing (as on Android).
    let submitID: String
    let title: String
    let submitTitle: String
    /// The API saved the client.
    let onSaved: (Components.Schemas.Client) -> Void
    /// *Anna de Vries openen*: the person wants the existing client instead.
    let onOpenExisting: (String) -> Void
    let onCancel: () -> Void
    @FocusState private var nameFocused: Bool

    var body: some View {
        InsetGroupedList {
            InsetGroup {
                nameField
                emailField
            }
            .padding(.top, Tokens.Spacing.space4)
            if let offer = model.existsText { existingOffer(offer) }
            localeChoice
            if let failed = model.saveFailedText {
                StatusMessage(text: failed, kind: .error, id: "\(idPrefix).failed")
            }
            if model.noPermission {
                StatusMessage(text: model.noPermissionText, kind: .error, id: "\(idPrefix).noPermission")
            }
        }
        .fivviCanvas()
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(title)
                    .font(.system(Tokens.TextStyle.headline))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("\(idPrefix).title")
            }
            ToolbarItem(placement: .cancellationAction) {
                Button(model.catalog[.clientsCancel], action: onCancel)
                    .accessibilityIdentifier("\(idPrefix).close")
            }
            ToolbarItem(placement: .confirmationAction) { submit }
        }
        // The bar's buttons are text: in the text-safe accent (4.5:1 in both modes), not the app's fill accent.
        .tint(Tokens.Colors.accentText)
        .environment(\.locale, model.catalog.formattingLocale)
        .onAppear { if model.mode == .add { nameFocused = true } }
    }

    private var nameField: some View {
        FormField(label: model.catalog[.clientsNameLabel], error: model.nameErrorText) {
            TextField(model.catalog[.clientsNameLabel], text: $model.name)
                .textInputAutocapitalization(.words)
                .submitLabel(.next)
                .focused($nameFocused)
                .textFieldStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityIdentifier("\(idPrefix).name")
        }
    }

    private var emailField: some View {
        FormField(label: model.catalog[.clientsEmailLabel], error: model.emailErrorText) {
            TextField(model.catalog[.clientsEmailLabel], text: $model.email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityIdentifier("\(idPrefix).email")
        }
    }

    /// "Anna de Vries gebruikt dit e-mailadres al." with *Anna de Vries openen* and *Ander e-mailadres*: no second
    /// client is created.
    private func existingOffer(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            StatusMessage(text: text, kind: .info, id: "\(idPrefix).duplicate")
            PillButtonStack {
                if let open = model.openExistingText, let existing = model.existing {
                    Button {
                        onOpenExisting(existing.id)
                    } label: {
                        pillLabel(open)
                    }
                    .buttonStyle(.pill(.tonal))
                    .accessibilityIdentifier("\(idPrefix).openExisting")
                }
                Button {
                    model.useAnotherEmail()
                } label: {
                    pillLabel(model.catalog[.clientsOtherEmail])
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("\(idPrefix).otherEmail")
            }
        }
    }

    private func pillLabel(_ text: String) -> some View {
        Text(text)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }

    /// *Standaard (Nederlands)*, *Nederlands*, *English*: a check mark on the one chosen.
    private var localeChoice: some View {
        InsetGroup(header: model.catalog[.clientsLocaleLabel]) {
            localeOption(model.defaultLocaleText, locale: nil, id: "default")
            ForEach(ClientLocale.allCases, id: \.self) { locale in
                localeOption(model.catalog.languageChoice(locale), locale: locale, id: locale.rawValue)
            }
        }
    }

    private func localeOption(_ text: String, locale: ClientLocale?, id: String) -> some View {
        Button {
            model.locale = locale
        } label: {
            HStack {
                Text(text)
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
                if model.locale == locale {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Tokens.Colors.accentText)
                        .accessibilityHidden(true)
                }
            }
            .insetRowLayout()
        }
        .buttonStyle(.insetRow)
        .accessibilityAddTraits(model.locale == locale ? .isSelected : [])
        .accessibilityIdentifier("\(idPrefix).language.\(id)")
    }

    @ViewBuilder private var submit: some View {
        if model.isSaving {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(model.catalog[.commonLoading])
                .accessibilityIdentifier("\(idPrefix).pending")
        } else {
            Button(submitTitle) {
                Task { if let client = await model.submit() { onSaved(client) } }
            }
            .fontWeight(.semibold)
            .accessibilityIdentifier("\(idPrefix).\(submitID)")
        }
    }
}
