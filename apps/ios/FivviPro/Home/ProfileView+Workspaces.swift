import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// The *Mijn werkruimtes* section of `ProfileView` (TM-04): a row for each workspace the person is on the team of, with
/// the switch *Ik geef zelf ook trainingen in …* where the API lists `team.manage` (F005), and, with more than one
/// workspace, the check and the tap that switch the current workspace (F012).
extension ProfileView {
    func workspacesSection(_ entries: [ProfileViewModel.Entry]) -> some View {
        InsetGroup(header: model.catalog[.myProfileWorkspacesTitle], headerIdentifier: "profile.workspacesTitle") {
            ForEach(entries) { entry in
                workspaceRow(entry, switchable: entries.count > 1)
                // The switch is a row of its own: a tap on its label moves it only when the `Toggle` is the whole row.
                if entry.canSwitchTrainsHere { trainsHere(entry) }
            }
        }
    }

    /// The mark, the name and the role; with more than one workspace the whole row is a button with a check on the
    /// current one.
    @ViewBuilder private func workspaceRow(_ entry: ProfileViewModel.Entry, switchable: Bool) -> some View {
        if switchable {
            let isCurrent = entry.id == current
            Button {
                // Like the back button, a row does nothing while a save is under way: leaving *Profiel* would hide how
                // it went. (A drag across the screen that ends on a row counts as its tap now that the rows are a
                // group of the kit's.)
                guard !model.isSaving else { return }
                onSelect(entry.id)
            } label: {
                HStack(spacing: Tokens.Spacing.space3) {
                    workspaceContent(entry)
                    // The slot stays when there is no check, so the roles of all rows end in one column.
                    Image(systemName: "checkmark")
                        .foregroundStyle(Tokens.Colors.accentText)
                        .opacity(isCurrent ? 1 : 0)
                        .frame(width: checkSlot)
                        .accessibilityHidden(true)
                }
                .insetRowLayout()
            }
            .buttonStyle(.insetRow)
            .accessibilityAddTraits(isCurrent ? .isSelected : [])
            .accessibilityIdentifier("profile.workspace.\(entry.slug)")
        } else {
            workspaceContent(entry)
                .insetRowLayout()
        }
    }

    /// TM-04: a 36 pt rounded mark in the workspace's colour (decorative: no initials, because the tokens guarantee
    /// 3:1 for the colour, not 4.5:1 for white text on it), the name, and the role at the trailing end. At the
    /// accessibility text sizes the role goes under the name, as there is no room next to it.
    private func workspaceContent(_ entry: ProfileViewModel.Entry) -> some View {
        HStack(spacing: Tokens.Spacing.space3) {
            RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous)
                .fill(Tokens.workspaceColor(for: entry.id))
                .frame(width: Metrics.mark, height: Metrics.mark)
                .accessibilityHidden(true)
            workspaceText(entry)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private func workspaceText(_ entry: ProfileViewModel.Entry) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Tokens.Spacing.space1))
            : AnyLayout(HStackLayout(spacing: Tokens.Spacing.space2))
        return layout {
            Text(entry.name)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
                .accessibilityIdentifier("profile.workspaceName.\(entry.slug)")
            Text(entry.role)
                .font(.system(Tokens.TextStyle.subhead))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("profile.workspaceRole.\(entry.slug)")
        }
    }

    private enum Metrics {
        /// The workspace's colour mark.
        static let mark: CGFloat = 36
    }

    /// *Ik geef zelf ook trainingen in …*: it shows what the API accepted and waits while saving; a tap sends the
    /// change and the switch moves only when the API accepted it.
    private func trainsHere(_ entry: ProfileViewModel.Entry) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            trainsHereToggle(entry)
            trainsHereStatus(entry)
        }
        .insetRowLayout()
    }

    private func trainsHereToggle(_ entry: ProfileViewModel.Entry) -> some View {
        Toggle(isOn: Binding(
            get: { entry.trainsHere },
            set: { trains in Task { await model.setTrainsHere(trains, in: entry.id) } }
        )) {
            Text(model.catalog.string(.profileTrainsHereLabel, entry.name))
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tint(Tokens.Colors.accentFill)
        .disabled(entry.change == .saving)
        // A tap on the label moves the switch too (SwiftUI's `Toggle` on iOS only takes the control itself), so the whole
        // row is the touch target. A tap on the control is the `Toggle`'s own; a second change while one is saving is
        // ignored by the model. At least 44 pt high, like the other rows.
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onTapGesture { Task { await model.setTrainsHere(!entry.trainsHere, in: entry.id) } }
        .accessibilityIdentifier("profile.trainsHere.\(entry.slug)")
    }

    @ViewBuilder private func trainsHereStatus(_ entry: ProfileViewModel.Entry) -> some View {
        switch entry.change {
        case .saved:
            line(model.catalog[.profileTrainsHereSaved], color: Tokens.Colors.textSecondary)
                .accessibilityIdentifier("profile.trainsHereSaved.\(entry.slug)")
        case .noConnection:
            line(model.catalog[.profileTrainsHereErrorsNoConnection], color: Tokens.Colors.statusDangerText)
                .accessibilityIdentifier("profile.trainsHereError.\(entry.slug)")
        case .failed:
            line(model.catalog[.profileTrainsHereErrorsGeneric], color: Tokens.Colors.statusDangerText)
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
