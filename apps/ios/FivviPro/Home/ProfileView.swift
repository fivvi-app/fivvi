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
/// once and saves it on the account. Under it, in a group with no title, *Hulp en contact* / *Help and contact* and
/// *Privacyverklaring* / *Privacy policy* open that page of the website in the language shown, in the system browser
/// (F064 AC17, `ProfileView+SiteLinks.swift`). While a save is under way the back button is hidden, which also stops
/// the swipe.
struct ProfileView: View {
    let model: ProfileViewModel
    let language: AppLanguage
    /// The ID of the workspace the app shows now.
    var current: String?
    /// Told the workspace the person tapped (F012); the home switches to it and goes back to the first tab.
    var onSelect: (String) -> Void = { _ in }
    /// Opens a page of the website in the system browser (F064 AC17); the home passes its `openURL`.
    let openLink: (URL) -> Void
    @Environment(\.dynamicTypeSize) var dynamicTypeSize
    /// The room of the check on a workspace row; it grows with the text size, like the check (a symbol).
    @ScaledMetric(relativeTo: .body) var checkSlot: CGFloat = 20

    var body: some View {
        LargeTitleScreen(title: model.catalog[.profileTitle], titleIdentifier: "profile.title") {
            content
        }
        .navigationBarBackButtonHidden(model.isSaving)
        .sheet(isPresented: Binding(
            get: { model.editor != nil },
            set: { if !$0 { model.cancelEditingName() } }
        )) {
            NameEditorView(model: model)
        }
        .environment(\.locale, model.catalog.formattingLocale)
        .task { await model.load() }
        .onReturnToForeground { await model.refresh() }
    }

    @ViewBuilder private var content: some View {
        if let account = model.account, case .loaded = model.state { detailsSection(account) }
        switch model.state {
        case .loading:
            InsetGroup {
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .insetRowLayout()
                    .accessibilityLabel(model.catalog[.commonLoading])
                    .accessibilityIdentifier("profile.loading")
            }
        case let .loaded(entries):
            workspacesSection(entries)
        case .failed:
            failedSection
        }
        languageSection
        siteLinksSection
    }

    /// The name (tap to change it) and the email address, which is read-only: changing it is out of scope (F001).
    private func detailsSection(_ account: ProfileViewModel.Account) -> some View {
        InsetGroup(header: model.catalog[.myProfileDetailsTitle], headerIdentifier: "profile.detailsTitle") {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(model.catalog[.myProfileNameLabel])
                    .font(.system(Tokens.TextStyle.footnote))
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
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Image(systemName: "chevron.forward")
                            .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                            .foregroundStyle(Tokens.Colors.fillDecorative)
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
            .insetRowLayout()
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(model.catalog[.myProfileEmailLabel])
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(account.email)
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.email")
            }
            .insetRowLayout()
        }
    }

    private var languageSection: some View {
        InsetGroup(header: model.catalog[.profileLanguage], headerIdentifier: "profile.language") {
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
                                .foregroundStyle(Tokens.Colors.accentText)
                                .accessibilityHidden(true)
                        }
                    }
                    .insetRowLayout()
                }
                .buttonStyle(.insetRow)
                .accessibilityAddTraits(language.catalog.locale == locale ? .isSelected : [])
                .accessibilityIdentifier("profile.language.\(locale.rawValue)")
            }
            if language.saveFailed {
                Text(model.catalog[.userMenuError])
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.statusDangerText)
                    .fixedSize(horizontal: false, vertical: true)
                    .insetRowLayout()
                    .accessibilityIdentifier("profile.language.error")
            }
        }
    }

    private var failedSection: some View {
        InsetGroup {
            VStack(spacing: Tokens.Spacing.space4) {
                Text(model.catalog[.profileError])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.error")
                PillButtonStack {
                    Button {
                        Task { await model.load() }
                    } label: {
                        Text(model.catalog[.commonRetry])
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pill(.filled))
                    .accessibilityIdentifier("profile.retry")
                }
            }
            .frame(maxWidth: .infinity)
            .insetRowLayout()
        }
    }
}
