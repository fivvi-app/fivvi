import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// *Profiel* / *Profile* (TM-04): the section *Jouw gegevens* / *Your details* has the name, which opens the sheet
/// `NameEditorView` when tapped, and the email address (read-only; F005). The section *Mijn werkruimtes* / *My
/// workspaces* lists each workspace the person is on the team of with their role (F003 AC9) and, where the API lists
/// `team.manage` for them (an Owner), the switch *Ik geef zelf ook trainingen in …* (F005 AC4, AC5). It asks again when
/// the app comes back to the foreground. With more than one workspace each row shows a check on the current one, and
/// tapping a row switches to that workspace and returns to the first tab (F012, `onSelect`); with one workspace the row
/// has no check and no action. *Taal* /
/// *Language* lists the two languages with a check mark on the one shown (F010): choosing one re-renders the app at
/// once and saves it on the account. While a save is under way the back button is hidden, which also stops the swipe.
struct ProfileView: View {
    let model: ProfileViewModel
    let language: AppLanguage
    /// The ID of the workspace the app shows now.
    var current: String?
    /// Told the workspace the person tapped (F012); the home switches to it and goes back to the first tab.
    var onSelect: (String) -> Void = { _ in }

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
}
