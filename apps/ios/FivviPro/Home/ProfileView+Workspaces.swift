import SwiftUI
import FivviDesignTokens
import FivviStrings

/// The *Mijn werkruimtes* section of `ProfileView` (TM-04): a row for each workspace the person is on the team of, with
/// the switch *Ik geef zelf ook trainingen in …* where the API lists `team.manage` (F005), and, with more than one
/// workspace, the check and the tap that switch the current workspace (F012).
extension ProfileView {
    func workspacesSection(_ entries: [ProfileViewModel.Entry]) -> some View {
        Section {
            ForEach(entries) { entry in
                workspaceRow(entry, switchable: entries.count > 1)
                // The switch is a row of its own: a tap on its label moves it only when the `Toggle` is the whole row.
                if entry.canSwitchTrainsHere { trainsHere(entry) }
            }
        } header: {
            Text(model.catalog[.myProfileWorkspacesTitle])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("profile.workspacesTitle")
        }
    }

    /// The name and the role; with more than one workspace the whole row is a button with a check on the current one.
    @ViewBuilder private func workspaceRow(_ entry: ProfileViewModel.Entry, switchable: Bool) -> some View {
        if switchable {
            let isCurrent = entry.id == current
            Button {
                onSelect(entry.id)
            } label: {
                HStack {
                    workspaceText(entry)
                    Spacer()
                    if isCurrent {
                        Image(systemName: "checkmark")
                            .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                            .accessibilityHidden(true)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isCurrent ? .isSelected : [])
            .accessibilityIdentifier("profile.workspace.\(entry.slug)")
        } else {
            workspaceText(entry)
        }
    }

    private func workspaceText(_ entry: ProfileViewModel.Entry) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(entry.name)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("profile.workspaceName.\(entry.slug)")
            Text(entry.role)
                .font(.system(Tokens.TextStyle.label))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("profile.workspaceRole.\(entry.slug)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
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
        // ignored by the model. At least 44 pt high, like the other rows.
        .frame(minHeight: 44)
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
