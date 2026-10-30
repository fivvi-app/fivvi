import SwiftUI
import FivviAPI
import FivviDesignTokens

/// *Profiel* / *Profile* (TM-04): the section *Mijn werkruimtes* / *My workspaces* lists each workspace the person is
/// on the team of with their role (F003 AC9). It asks again when the app comes back to the foreground. A row does
/// nothing when tapped: switching comes with F012; F005 adds the name and email address to this screen. *Taal* /
/// *Language* lists the two languages with a check mark on the one shown (F010): choosing one re-renders the app at
/// once and saves it on the account.
struct ProfileView: View {
    let model: ProfileViewModel
    let language: AppLanguage

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.Colors.bgCanvas)
            .navigationBarTitleDisplayMode(.inline)
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
            languageSection
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
        }
        .scrollContentBackground(.hidden)
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
            }
        } header: {
            Text(model.catalog[.myProfileWorkspacesTitle])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("profile.workspacesTitle")
        }
    }
}
