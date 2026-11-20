import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// TD-03 *Groepsles* (F021): the class's name with the date and time under it, the description cut to a few lines with
/// *Meer* / *Minder*, a group with the location and the trainer (*Trainer nodig* without one), *{booked}/{capacity}
/// geboekt* with *Nog geen boekingen.*, and for the Owner the footnote that editing, a fixed series and the trainers are
/// managed on the web. The Owner's ⋯ menu has *Les wijzigen*, which says the same; a Trainer has no menu. The sections of
/// later features (participants, attendance, cancelling) are not shown yet.
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
            if let onWeb = model.manageOnWebText {
                StatusMessage(text: onWeb, kind: .info, id: "classDate.manageOnWeb")
            }
            description
            InsetGroup {
                locationRow
                trainerRow
            }
            bookedCard
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

    private var menu: some View {
        Menu {
            Button(model.editText) { model.editTapped() }
                .accessibilityIdentifier("classDate.edit")
        } label: {
            Image(systemName: "ellipsis.circle")
                .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(catalog[.sessionPageMore])
        .accessibilityIdentifier("classDate.menu")
    }
}
