import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// TD-02 *Privésessie* (F020): the title *Privésessie met Anna* with the date and time under it, a group with the
/// location and its *Route* button (which opens the maps app with the address) and the workspace with the trainer, and
/// the client. The ⋯ menu has *Verplaatsen* (PS-05, for whoever may plan sessions, not for a cancelled session) and
/// *Klantprofiel*. The sections of later features (workout, last time, notes, attendance) are not shown yet.
struct SessionView: View {
    let model: SessionViewModel
    let language: AppLanguage
    /// The person may plan sessions (`session.private.manage.own` or `.any`), so *Verplaatsen* shows.
    let canMove: Bool
    let onOpenClient: (String) -> Void
    @Environment(\.openURL) private var openURL
    @State private var rescheduling: RescheduleViewModel?

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                placeholder { SkeletonRows(label: catalog[.commonLoading], id: "session.loading") }
            case .failed:
                placeholder { failure }
            case .noPermission:
                placeholder {
                    StatusMessage(text: catalog[.noPermissionTitle], kind: .info, id: "session.noPermissionTitle")
                    StatusMessage(
                        text: catalog.string(.noPermissionBody, model.workspace.name), kind: .info,
                        id: "session.noPermission"
                    )
                }
            case .loaded:
                loaded
            }
        }
        .task { await model.load() }
        .onReturnToForeground { await model.refresh() }
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .sheet(item: $rescheduling) { form in
            NavigationStack {
                RescheduleView(
                    model: form, language: language,
                    onMoved: { moved in
                        model.didMove(moved, text: form.movedText(moved))
                        rescheduling = nil
                    },
                    onCancel: { rescheduling = nil }
                )
            }
            .presentationDetents([.large])
        }
        .environment(\.locale, catalog.formattingLocale)
    }

    private func placeholder(@ViewBuilder _ content: () -> some View) -> some View {
        LargeTitleScreen(title: catalog[.sessionFormTitle], titleIdentifier: "session.title") { content() }
    }

    private var failure: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            StatusMessage(text: catalog[.sessionFormLoadFailed], kind: .error, id: "session.error")
            PillButtonStack {
                Button {
                    Task { await model.load() }
                } label: {
                    Text(catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("session.retry")
            }
        }
    }

    private var loaded: some View {
        LargeTitleScreen(title: model.title, subtitle: model.whenText, titleIdentifier: "session.title") {
            if model.isCancelled {
                StatusMessage(text: model.cancelledText, kind: .info, id: "session.cancelled")
            }
            if let moved = model.movedText {
                StatusMessage(text: moved, kind: .success, id: "session.moved")
            }
            InsetGroup {
                locationRow
                workspaceRow
            }
            InsetGroup(header: model.clientLabel) { clientRow }
        }
        .toolbar { ToolbarItem(placement: .primaryAction) { menu } }
    }

    /// The place, with *Route* when the location has an address.
    private var locationRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            Text(model.locationName)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityIdentifier("session.location")
            Spacer(minLength: Tokens.Spacing.space2)
            if let url = model.routeURL {
                Button {
                    openURL(url)
                } label: {
                    Label(catalog[.sessionPageRoute], systemImage: "arrow.triangle.turn.up.right.diamond")
                        .font(.system(Tokens.TextStyle.body, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("session.route")
            }
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }

    /// The workspace, with the trainer under it: *Jij* for the person looking.
    private var workspaceRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "person.2")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.workspace.name)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityIdentifier("session.workspace")
                Text(model.trainerText)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityIdentifier("session.trainer")
            }
            Spacer(minLength: Tokens.Spacing.space2)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }

    @ViewBuilder private var clientRow: some View {
        if let client = model.client {
            Button {
                onOpenClient(client.clientId)
            } label: {
                InsetRow(title: client.name, showsChevron: true)
            }
            .buttonStyle(.insetRow)
            .accessibilityIdentifier("session.client")
        }
    }

    @ViewBuilder private var menu: some View {
        if model.client != nil {
            Menu {
                if canMove, !model.isCancelled {
                    Button(catalog[.sessionPageReschedule]) { rescheduling = model.rescheduleForm() }
                        .accessibilityIdentifier("session.reschedule")
                }
                if let client = model.client {
                    Button(catalog[.sessionPageClientProfile]) { onOpenClient(client.clientId) }
                        .accessibilityIdentifier("session.clientProfile")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(catalog[.sessionPageMore])
            .accessibilityIdentifier("session.menu")
        }
    }
}
