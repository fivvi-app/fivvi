import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// TD-03 *Groepsles* (F021): the class's name with the date and time under it, the description cut to a few lines with
/// *Meer* / *Minder*, a group with the location and the trainer (*Trainer nodig* without one), *{booked}/{capacity}
/// geboekt* with *Nog geen boekingen.*, and for the Owner the footnote that editing, a fixed series and the trainers are
/// managed on the web. The Owner's ⋯ menu starts with *Boekingslink delen* (F037; also a button below the booked card,
/// for the Owner and the Trainers, not on a cancelled or past date), has *Les wijzigen*, which says the same, and below
/// a divider the destructive *Les annuleren* (F026): a native confirmation that says how many booked clients get an
/// email; a Trainer has no menu.
/// A cancelled date shows "Geannuleerd op … door …" and no actions. The sections of later features (participants,
/// attendance) are not shown yet.
struct ClassDateView: View {
    let model: ClassDateViewModel
    let language: AppLanguage

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                placeholder { SkeletonRows(label: catalog[.commonLoading], id: "classDate.loading") }
            case .failed:
                placeholder { failure }
            case .noPermission:
                placeholder {
                    StatusMessage(text: catalog[.noPermissionTitle], kind: .info, id: "classDate.noPermissionTitle")
                    StatusMessage(
                        text: catalog.string(.noPermissionBody, model.workspace.name), kind: .info,
                        id: "classDate.noPermission"
                    )
                }
            case .loaded:
                loaded
            }
        }
        .task { await model.load() }
        .onReturnToForeground { await model.refresh() }
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .alert(
            model.cancelTitleText,
            isPresented: Binding(get: { model.cancelAsk != nil }, set: { if !$0 { model.dismissCancel() } })
        ) {
            Button(model.cancelSubmitText, role: .destructive) { Task { await model.confirmCancel() } }
                .accessibilityIdentifier("classDate.cancel.submit")
            Button(model.cancelBackText, role: .cancel) { model.dismissCancel() }
                .accessibilityIdentifier("classDate.cancel.back")
        } message: {
            Text(model.cancelMessageText)
        }
        .environment(\.locale, catalog.formattingLocale)
    }

    private func placeholder(@ViewBuilder _ content: () -> some View) -> some View {
        LargeTitleScreen(title: catalog[.newGroupClass], titleIdentifier: "classDate.title") { content() }
    }

    private var failure: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            StatusMessage(text: catalog[.sessionFormLoadFailed], kind: .error, id: "classDate.error")
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
                .accessibilityIdentifier("classDate.retry")
            }
        }
    }

    private var loaded: some View {
        LargeTitleScreen(
            title: model.title, eyebrow: catalog[.newGroupClass], subtitle: model.whenText,
            titleIdentifier: "classDate.title"
        ) {
            if let added = model.addedText {
                StatusMessage(text: added, kind: .success, id: "classDate.added")
            }
            if let cancelled = model.cancelledText {
                StatusMessage(text: cancelled, kind: .info, id: "classDate.cancelled")
            }
            if let failure = model.cancelFailureText {
                StatusMessage(text: failure, kind: .error, id: "classDate.cancelFailed")
            }
            if let offline = model.cancelOfflineText {
                StatusMessage(text: offline, kind: .info, id: "classDate.cancelOffline")
            }
            if let copied = model.shareLinkCopiedText {
                StatusMessage(text: copied, kind: .success, id: "classDate.shareCopied")
            }
            if let failure = model.shareLinkFailureText {
                StatusMessage(text: failure, kind: .error, id: "classDate.shareFailed")
            }
            if let offline = model.shareLinkOfflineText {
                StatusMessage(text: offline, kind: .info, id: "classDate.shareOffline")
            }
            if let onWeb = model.manageOnWebText {
                StatusMessage(text: onWeb, kind: .info, id: "classDate.manageOnWeb")
            }
            if let series = model.seriesLineText {
                Text(series)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Tokens.Spacing.space5)
                    .accessibilityIdentifier("classDate.series")
            }
            description
            InsetGroup {
                locationRow
                trainerRow
            }
            bookedCard
            if model.showsShareLink { shareLinkButton }
            if let note = model.ownerNoteText {
                Text(note)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .padding(.horizontal, Tokens.Spacing.space5)
                    .accessibilityIdentifier("classDate.ownerNote")
            }
        }
        .toolbar { if model.hasMenu { ToolbarItem(placement: .primaryAction) { menu } } }
    }

    /// The description in the viewer's language, else Dutch (marked as Dutch), cut to three lines until *Meer*.
    @ViewBuilder private var description: some View {
        if let text = model.descriptionText {
            Card {
                VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
                    if let mark = model.descriptionMarkText {
                        Text(mark)
                            .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                            .foregroundStyle(Tokens.Colors.textSecondary)
                            .accessibilityIdentifier("classDate.descriptionMark")
                    }
                    Text(text)
                        .font(.system(Tokens.TextStyle.body))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .lineLimit(model.descriptionOpen ? nil : 3)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("classDate.description")
                    if let toggle = model.descriptionToggleText {
                        Button(toggle) { model.toggleDescription() }
                            .font(.system(Tokens.TextStyle.body, weight: .semibold))
                            .foregroundStyle(Tokens.Colors.accentText)
                            .frame(minHeight: 44, alignment: .leading)
                            .accessibilityIdentifier("classDate.descriptionToggle")
                    }
                }
            }
        }
    }

    private var locationRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            Text(model.locationName)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityIdentifier("classDate.location")
            Spacer(minLength: Tokens.Spacing.space2)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }

    private var trainerRow: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            Image(systemName: "person")
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.trainerLabel)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                Text(model.trainerText)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityIdentifier("classDate.trainer")
            }
            Spacer(minLength: Tokens.Spacing.space2)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }

    private var bookedCard: some View {
        Card {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
                Text(model.bookedLabel)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                Text(model.bookedText)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .accessibilityIdentifier("classDate.booked")
                if model.showsNoBookings {
                    Text(model.noBookingsText)
                        .font(.system(Tokens.TextStyle.subhead))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .accessibilityIdentifier("classDate.noBookings")
                }
            }
        }
    }

    /// *Boekingslink delen*, below the booked card (the participants come with F025).
    private var shareLinkButton: some View {
        PillButtonStack {
            Button {
                Task { await model.shareLink() }
            } label: {
                Label(model.shareLinkText, systemImage: "link")
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.pill(.tonal))
            .disabled(!model.canTapShareLink)
            .accessibilityIdentifier("classDate.shareLink")
        }
    }

    private var menu: some View {
        Menu {
            if model.showsShareLinkInMenu {
                Button { Task { await model.shareLink() } } label: {
                    Label(model.shareLinkText, systemImage: "link")
                }
                .disabled(!model.canTapShareLink)
                .accessibilityIdentifier("classDate.shareLinkMenu")
            }
            Button(model.editText) { model.editTapped() }
                .accessibilityIdentifier("classDate.edit")
            Divider()
            Button(model.cancelText, role: .destructive) { Task { await model.askToCancel() } }
                .disabled(!model.canStartCancel)
                .accessibilityIdentifier("classDate.cancel")
        } label: {
            Image(systemName: "ellipsis.circle")
                .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(catalog[.sessionPageMore])
        .accessibilityIdentifier("classDate.menu")
    }
}
