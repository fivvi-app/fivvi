import SwiftUI
import FivviDesignTokens

/// *Profiel* / *Profile* (TM-04): the section *Mijn werkruimtes* / *My workspaces* lists each workspace the person is
/// on the team of with their role (F003 AC9). It asks again when the app comes back to the foreground. A row does
/// nothing when tapped: switching comes with F012; F005 and F010 add the name, email address and language to this
/// screen.
struct ProfileView: View {
    let model: ProfileViewModel

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

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(model.catalog[.commonLoading])
                .accessibilityIdentifier("profile.loading")
        case let .loaded(entries):
            list(entries)
        case .failed:
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
            .padding(Tokens.Spacing.gutter)
        }
    }

    private func list(_ entries: [ProfileViewModel.Entry]) -> some View {
        List {
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
        .scrollContentBackground(.hidden)
    }
}
