import SwiftUI
import FivviAPI
import FivviDesignTokens

/// *Profiel* / *Profile* (TM-04): the section *Jouw gegevens* / *Your details* has the name, which opens the sheet
/// `NameEditorView` when tapped, and the email address (read-only; F005). The section *Mijn werkruimtes* / *My
/// workspaces* lists each workspace the person is on the team of with their role (F003 AC9) and, where the API lists
/// `team.manage` for them (an Owner), the switch *Ik geef zelf ook trainingen in …* (F005 AC4, AC5). It asks again when
/// the app comes back to the foreground. A row does nothing when tapped: switching comes with F012. *Taal* /
/// *Language* lists the two languages with a check mark on the one shown (F010): choosing one re-renders the app at
/// once and saves it on the account. While a save is under way the back button is hidden, which also stops the swipe.
struct ProfileView: View {
    let model: ProfileViewModel
    let language: AppLanguage

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.Colors.bgCanvas)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(model.isSaving)
            .sheet(isPresented: Binding(
                get: { model.editor != nil },
                set: { if !$0 { model.cancelEditingName() } }
            )) {
                NameEditorView(model: model)
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(model.catalog[.profileTitle])
                        .font(.headline)
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("profile.title")
                }
            }
            .environment(\.locale, model.catalog.formattingLocale)
            .task { await model.load() }
            .onReturnToForeground { await model.refresh() }
    }

    private var content: some View {
        List {
            if let account = model.account, case .loaded = model.state { detailsSection(account) }
            switch model.state {
            case .loading:
                Section {
                    ProgressView()
                        .tint(Tokens.Colors.textSecondary)
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel(model.catalog[.commonLoading])
                        .accessibilityIdentifier("profile.loading")
                }
            case let .loaded(entries):
                workspacesSection(entries)
            case .failed:
                failedSection
            }
            languageSection
        }
        .scrollContentBackground(.hidden)
    }

    /// The name (tap to change it) and the email address, which is read-only: changing it is out of scope (F001).
    private func detailsSection(_ account: ProfileViewModel.Account) -> some View {
        Section {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(model.catalog[.myProfileNameLabel])
                    .font(.system(Tokens.TextStyle.label))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                // The name itself is the button, so the one element that opens the sheet has both the id and the name.
                Button {
                    model.startEditingName()
                } label: {
                    HStack {
                        Text(account.name ?? model.catalog[.myProfileEditName])
                            .font(.system(Tokens.TextStyle.body))
                            .foregroundStyle(Tokens.Colors.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(Tokens.Colors.textSecondary)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(model.catalog[.myProfileEditName])
                .accessibilityIdentifier("profile.name")
                if model.nameSaved {
                    Text(model.catalog[.myProfileSaved])
                        .font(.system(Tokens.TextStyle.footnote))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("profile.nameSaved")
                }
            }
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(model.catalog[.myProfileEmailLabel])
                    .font(.system(Tokens.TextStyle.label))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(account.email)
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.email")
            }
        } header: {
            Text(model.catalog[.myProfileDetailsTitle])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("profile.detailsTitle")
        }
    }

    private var languageSection: some View {
        Section {
            ForEach(Components.Schemas.Locale.allCases, id: \.self) { locale in
                Button {
                    language.choose(locale)
                    Task { await language.save() }
                } label: {
                    HStack {
                        Text(model.catalog[locale.languageNameKey])
                            .font(.system(Tokens.TextStyle.body))
                            .foregroundStyle(Tokens.Colors.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        if language.catalog.locale == locale {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(language.catalog.locale == locale ? .isSelected : [])
                .accessibilityIdentifier("profile.language.\(locale.rawValue)")
            }
            if language.saveFailed {
                Text(model.catalog[.userMenuError])
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.statusDangerFg)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.language.error")
            }
        } header: {
            Text(model.catalog[.profileLanguage])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("profile.language")
        }
    }

    private var failedSection: some View {
        Section {
            VStack(spacing: Tokens.Spacing.space6) {
                Text(model.catalog[.profileError])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.error")
                Button {
                    Task { await model.load() }
                } label: {
                    Text(model.catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("profile.retry")
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func workspacesSection(_ entries: [ProfileViewModel.Entry]) -> some View {
        Section {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                    Text(entry.name)
                        .font(.system(Tokens.TextStyle.body))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("profile.workspaceName.\(entry.slug)")
                    Text(entry.role)
                        .font(.system(Tokens.TextStyle.label))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("profile.workspaceRole.\(entry.slug)")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .contain)
                // The switch is a row of its own: a tap on its label moves it only when the `Toggle` is the whole row.
                if entry.canSwitchTrainsHere { trainsHere(entry) }
            }
        } header: {
            Text(model.catalog[.myProfileWorkspacesTitle])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("profile.workspacesTitle")
        }
    }

    /// *Ik geef zelf ook trainingen in …*: it shows what the API accepted and waits while saving; a tap sends the
    /// change and the switch moves only when the API accepted it.
    @ViewBuilder private func trainsHere(_ entry: ProfileViewModel.Entry) -> some View {
        Toggle(isOn: Binding(
            get: { entry.trainsHere },
            set: { trains in Task { await model.setTrainsHere(trains, in: entry.id) } }
        )) {
            Text(model.catalog.string(.profileTrainsHereLabel, entry.name))
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tint(Tokens.Colors.actionPrimaryBg)
        .disabled(entry.change == .saving)
        // A tap on the label moves the switch too (SwiftUI's `Toggle` on iOS only takes the control itself), so the whole
        // row is the touch target. A tap on the control is the `Toggle`'s own; a second change while one is saving is
        // ignored by the model.
        .contentShape(Rectangle())
        .onTapGesture { Task { await model.setTrainsHere(!entry.trainsHere, in: entry.id) } }
        .accessibilityIdentifier("profile.trainsHere.\(entry.slug)")
        switch entry.change {
        case .saved:
            line(model.catalog[.profileTrainsHereSaved], color: Tokens.Colors.textSecondary)
                .accessibilityIdentifier("profile.trainsHereSaved.\(entry.slug)")
        case .noConnection:
            line(model.catalog[.profileTrainsHereErrorsNoConnection], color: Tokens.Colors.statusDangerFg)
                .accessibilityIdentifier("profile.trainsHereError.\(entry.slug)")
        case .failed:
            line(model.catalog[.profileTrainsHereErrorsGeneric], color: Tokens.Colors.statusDangerFg)
                .accessibilityIdentifier("profile.trainsHereError.\(entry.slug)")
        case .idle, .saving:
            EmptyView()
        }
    }

    private func line(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.footnote))
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }
}
