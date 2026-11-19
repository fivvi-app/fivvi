import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviLanguage
import FivviStrings
import FivviUI

/// *Profiel* / *Profile* of the client app: the name and the email address (read-only; editing is F033), *Taal* /
/// *Language* (Nederlands · English, saved on the account, F010; offered once the account has loaded, so the stored language
/// of the opening read can't undo a choice made while it was out), *Uitloggen* and the app's version. One scroll, so text at
/// the largest size wraps. The ids are the ones of Fivvi Pro's *Profiel* and of the Android client app.
struct ProfileView: View {
    let account: AccountViewModel
    let language: AppLanguage
    let version: String
    let onRetry: () -> Void

    private var catalog: Catalog { language.catalog }

    var body: some View {
        LargeTitleScreen(title: catalog[.clientNavProfile], titleIdentifier: "profile.title") {
            switch account.state {
            case .loading:
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(catalog[.commonLoading])
                    .accessibilityIdentifier("profile.loading")
            case let .loaded(name, email, _):
                identity(name: name, email: email)
                languageSection
            case .failed:
                failed
            }
            if account.state != .failed { signOut }
            if account.state != .failed { versionLine }
        }
    }

    /// The name, when the account has one, and the email address, centred, read-only.
    private func identity(name: String?, email: String) -> some View {
        VStack(spacing: Tokens.Spacing.space1) {
            if let name {
                Text(name)
                    .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityIdentifier("profile.name")
            }
            Text(email)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(name == nil ? Tokens.Colors.textPrimary : Tokens.Colors.textSecondary)
                .accessibilityIdentifier("profile.email")
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    private var languageSection: some View {
        InsetGroup(header: catalog[.profileLanguage], headerIdentifier: "profile.language") {
            ForEach(Components.Schemas.Locale.allCases, id: \.self) { locale in
                Button {
                    language.choose(locale)
                    Task { await language.save() }
                } label: {
                    HStack {
                        Text(catalog[locale.languageNameKey])
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
                Text(catalog[.userMenuError])
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.statusDangerText)
                    .fixedSize(horizontal: false, vertical: true)
                    .insetRowLayout()
                    .accessibilityIdentifier("profile.language.error")
            }
        }
    }

    @ViewBuilder private var signOut: some View {
        if account.isSigningOut {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("profile.signingOut")
        } else {
            PillButtonStack {
                Button {
                    Task { await account.signOut() }
                } label: {
                    Text(catalog[.signOutLabel])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("profile.signOut")
            }
        }
    }

    private var versionLine: some View {
        Text(catalog.string(.profileVersion, version))
            .font(.system(Tokens.TextStyle.subhead))
            .foregroundStyle(Tokens.Colors.textSecondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("profile.version")
    }

    private var failed: some View {
        VStack(spacing: Tokens.Spacing.space4) {
            StatusMessage(text: catalog[.signInErrorsGeneric], kind: .error, id: "profile.error")
            PillButtonStack {
                Button(action: onRetry) {
                    Text(catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("profile.retry")
            }
        }
    }
}
