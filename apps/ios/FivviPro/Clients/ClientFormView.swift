import SwiftUI
import FivviAPI
import FivviDesignTokens

extension ClientFormViewModel: Identifiable {}

/// The form of a sheet that adds a client (*+ Nieuwe klant*) or edits one (*Bewerken*): *Naam* (focused, required),
/// *E-mailadres (optioneel)*, *Taal voor e-mails* with *Standaard (Nederlands)* preselected, and *Annuleren* and the
/// save button in the bar (F006 AC1 to AC3, AC7), where the keyboard doesn't cover them. Field messages sit under their
/// field; a failed save keeps the input; a duplicate email address offers the existing client. Text wraps, every control
/// keeps a 44 pt touch target. The test ids start with `idPrefix` (`clients.add` or `clientProfile.edit`), as on Android.
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
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space5) {
                nameField
                emailField
                if let offer = model.existsText { existingOffer(offer) }
                localeChoice
                if let failed = model.saveFailedText {
                    ClientMessage(text: failed, kind: .error, id: "\(idPrefix).failed")
                }
                if model.noPermission {
                    ClientMessage(text: model.noPermissionText, kind: .error, id: "\(idPrefix).noPermission")
                }
            }
            .padding(Tokens.Spacing.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .foregroundStyle(Tokens.Colors.textPrimary)
        .background(Tokens.Colors.bgCanvas)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(title)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("\(idPrefix).title")
            }
            ToolbarItem(placement: .cancellationAction) {
                Button(model.catalog[.clientsCancel], action: onCancel)
                    .accessibilityIdentifier("\(idPrefix).close")
            }
            ToolbarItem(placement: .confirmationAction) { submit }
        }
        .environment(\.locale, model.catalog.formattingLocale)
        .onAppear { if model.mode == .add { nameFocused = true } }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            fieldLabel(model.catalog[.clientsNameLabel])
            TextField(model.catalog[.clientsNameLabel], text: $model.name)
                .textInputAutocapitalization(.words)
                .submitLabel(.next)
                .accessibilityLabel(model.catalog[.clientsNameLabel])
                .focused($nameFocused)
                .textFieldFrame()
                .accessibilityIdentifier("\(idPrefix).name")
            fieldError(model.nameErrorText, id: "\(idPrefix).nameError")
        }
    }

    private var emailField: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            fieldLabel(model.catalog[.clientsEmailLabel])
            TextField(model.catalog[.clientsEmailLabel], text: $model.email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel(model.catalog[.clientsEmailLabel])
                .textFieldFrame()
                .accessibilityIdentifier("\(idPrefix).email")
            fieldError(model.emailErrorText, id: "\(idPrefix).emailError")
        }
    }

    /// "Anna de Vries gebruikt dit e-mailadres al." with *Anna de Vries openen* and *Ander e-mailadres*: no second client
    /// is created.
    private func existingOffer(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            ClientMessage(text: text, kind: .info, id: "\(idPrefix).duplicate")
            if let open = model.openExistingText, let existing = model.existing {
                Button {
                    onOpenExisting(existing.id)
                } label: {
                    Text(open)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.secondaryAction)
                .accessibilityIdentifier("\(idPrefix).openExisting")
            }
            Button {
                model.useAnotherEmail()
            } label: {
                Text(model.catalog[.clientsOtherEmail])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.secondaryAction)
            .accessibilityIdentifier("\(idPrefix).otherEmail")
        }
    }

    /// *Standaard (Nederlands)*, *Nederlands*, *English*: a check mark on the one chosen.
    private var localeChoice: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            fieldLabel(model.catalog[.clientsLocaleLabel])
                .accessibilityAddTraits(.isHeader)
            localeOption(model.defaultLocaleText, locale: nil, id: "default")
            ForEach(ClientLocale.allCases, id: \.self) { locale in
                localeOption(model.catalog.languageChoice(locale), locale: locale, id: locale.rawValue)
            }
        }
        .accessibilityElement(children: .contain)
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
                        .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.label, weight: .semibold))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true)
    }

    @ViewBuilder private func fieldError(_ text: String?, id: String) -> some View {
        if let text {
            Text(text)
                .font(.system(Tokens.TextStyle.footnote))
                .foregroundStyle(Tokens.Colors.statusDangerFg)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(id)
        }
    }
}
