import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// TD-05 *Nieuwe groepsles* (F021), the sheet of **+** → *Groepsles* for the Owner: *Annuleren* and *Opslaan* in the
/// bar and a form in titled sections, as the owner asked (6 November 2026): *Naam en omschrijving* (the names and
/// descriptions in Dutch and English, each on a line of its own and as wide as the screen), *De les* (the trainer or
/// *Trainer nodig*, the level *Niveau* (F067), the capacity and the location) and *Wanneer* (the date, the start, the
/// end and *Herhalen: Niet herhalen* or *Elke week op {weekday}*, F022, with the note that the next 12 weeks go in the
/// calendar). Leaving with something entered asks first. Without a connection the form says so and *Opslaan* is off.
struct NewGroupClassView: View {
    @Bindable var model: NewGroupClassViewModel
    let language: AppLanguage
    /// The API created the class and its first date; the second value is how many dates it added (12 for a weekly class).
    let onSaved: (Components.Schemas.Session, Int) -> Void
    let onCancel: () -> Void
    @State private var confirmingDiscard = false

    private var catalog: Catalog { model.catalog }

    var body: some View {
        InsetGroupedList { content.padding(.top, Tokens.Spacing.space4) }
            .fivviCanvas()
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(model.titleText)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(model.titleText)
                        .font(.system(Tokens.TextStyle.headline))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("newClass.title")
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(catalog[.sessionFormCancel], action: cancel)
                        .accessibilityIdentifier("newClass.cancel")
                }
                ToolbarItem(placement: .confirmationAction) { saveButton }
            }
            .tint(Tokens.Colors.accentText)
            .interactiveDismissDisabled(model.isDirty)
            .confirmationDialog(
                catalog[.sessionFormDiscardTitle], isPresented: $confirmingDiscard, titleVisibility: .visible
            ) {
                Button(catalog[.sessionFormDiscard], role: .destructive, action: onCancel)
                    .accessibilityIdentifier("newClass.discard")
                Button(catalog[.sessionFormKeepEditing], role: .cancel) {}
                    .accessibilityIdentifier("newClass.keepEditing")
            } message: {
                Text(catalog[.sessionFormDiscardDescription])
            }
            .alert(
                model.doubleBookingTitle,
                isPresented: Binding(
                    get: { model.doubleBooking != nil }, set: { if !$0 { model.dismissDoubleBooking() } }
                )
            ) {
                Button(model.doubleBookingBackText, role: .cancel) {}
                    .accessibilityIdentifier("newClass.doubleBooking.back")
                Button(model.doubleBookingSaveAnywayText) { Task { await save(allowConflicts: true) } }
                    .accessibilityIdentifier("newClass.doubleBooking.saveAnyway")
            } message: {
                Text(model.doubleBookingMessage)
            }
            .task { await model.start() }
            .onReturnToForeground { if model.isOffline { await model.start() } }
            .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
            .environment(\.locale, catalog.formattingLocale)
            .environment(\.timeZone, model.workspace.timeZone)
    }

    private func cancel() {
        if model.isDirty { confirmingDiscard = true } else { onCancel() }
    }

    private func save(allowConflicts: Bool = false) async {
        if let date = await model.save(allowConflicts: allowConflicts) { onSaved(date, model.datesAdded) }
    }

    @ViewBuilder private var saveButton: some View {
        if model.isSaving {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("newClass.pending")
        } else {
            Button(catalog[.sessionFormSave]) { Task { await save() } }
                .fontWeight(.semibold)
                .disabled(!model.canSave)
                .accessibilityIdentifier("newClass.save")
        }
    }

    @ViewBuilder private var content: some View {
        if let offline = model.offlineText {
            StatusMessage(text: offline, kind: .info, id: "newClass.offline")
            retryButton
        }
        switch model.load {
        case .loading:
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("newClass.loading")
        case .failed:
            StatusMessage(text: model.loadFailedText, kind: .error, id: "newClass.loadFailed")
            retryButton
        case .offline:
            EmptyView()
        case .noPermission:
            StatusMessage(text: model.noPermissionText, kind: .info, id: "newClass.noPermission")
        case .ready:
            fields
        }
    }

    private var retryButton: some View {
        PillButtonStack {
            Button {
                Task { await model.start() }
            } label: {
                Text(catalog[.commonRetry])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.pill(.tonal))
            .accessibilityIdentifier("newClass.retry")
        }
    }

    @ViewBuilder private var fields: some View {
        InsetGroup(header: model.nameSectionText, footer: model.descriptionNote) {
            textField(model.nameNlLabel, $model.nameNl, error: model.nameErrorText, id: "nameNl", lines: 1)
            textField(model.nameEnLabel, $model.nameEn, error: model.nameEnErrorText, id: "nameEn", lines: 1)
            textField(
                model.descriptionNlLabel, $model.descriptionNl, error: model.descriptionNlErrorText,
                id: "descriptionNl", lines: 5
            )
            textField(
                model.descriptionEnLabel, $model.descriptionEn, error: model.descriptionEnErrorText,
                id: "descriptionEn", lines: 5
            )
        }
        InsetGroup(header: model.classSectionText) {
            trainerRow
            levelRow
            capacityRow
            Text(model.locationText)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .insetRowLayout()
                .accessibilityIdentifier("newClass.location")
        }
        timeGroup
        if let failure = model.saveFailureText {
            StatusMessage(text: failure, kind: .error, id: "newClass.failed")
        }
    }

    private func textField(
        _ label: String, _ text: Binding<String>, error: String?, id: String, lines: Int
    ) -> some View {
        FormField(label: label, error: error) {
            TextField(label, text: text, axis: .vertical)
                .lineLimit(lines == 1 ? 1...2 : 3...lines)
                .textFieldStyle(.plain)
                .frame(minHeight: 44, alignment: .top)
                .accessibilityIdentifier("newClass.\(id)")
        }
    }

    private var trainerRow: some View {
        HStack {
            Text(model.trainerLabel)
                .foregroundStyle(Tokens.Colors.textPrimary)
            Spacer(minLength: Tokens.Spacing.space2)
            Picker(model.trainerLabel, selection: $model.trainerID) {
                Text(model.trainerNeededText).tag("")
                ForEach(model.trainers, id: \.id) { trainer in
                    Text(model.trainerText(trainer)).tag(trainer.id)
                }
            }
            .labelsHidden()
            .accessibilityIdentifier("newClass.trainer")
        }
        .insetRowLayout()
    }

    private var capacityRow: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Stepper(value: $model.capacity, in: 1...100) {
                HStack {
                    Text(model.capacityLabel)
                    Spacer()
                    Text(String(model.capacity))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .accessibilityIdentifier("newClass.capacityValue")
                }
            }
            .accessibilityIdentifier("newClass.capacity")
            if let error = model.capacityErrorText { errorLine(error, id: "newClass.capacityError") }
        }
        .insetRowLayout()
    }

    private var start: Binding<Date> {
        Binding(get: { model.time.start }, set: { model.time.start = $0 })
    }

    private var timeGroup: some View {
        InsetGroup(header: model.whenSectionText) {
            DatePicker(catalog[.sessionFormDateLabel], selection: start, displayedComponents: .date)
                .insetRowLayout()
                .accessibilityIdentifier("newClass.date")
            DatePicker(catalog[.sessionFormStartLabel], selection: start, displayedComponents: .hourAndMinute)
                .insetRowLayout()
                .accessibilityIdentifier("newClass.start")
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                DatePicker(
                    model.endLabel, selection: Binding(get: { model.end }, set: { model.setEnd($0) }),
                    displayedComponents: .hourAndMinute
                )
                .accessibilityIdentifier("newClass.end")
                if let error = model.endErrorText { errorLine(error, id: "newClass.endError") }
                if let error = model.timeRefusalText { errorLine(error, id: "newClass.timeError") }
            }
            .insetRowLayout()
            repeatRow
        }
        .onChange(of: model.time.start) { model.time.clearRefusal() }
    }

    /// *Herhalen*: *Niet herhalen* or *Elke week op {weekday}*, with the note under it for the weekly choice.
    private var repeatRow: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            HStack {
                Text(model.repeatLabel)
                    .foregroundStyle(Tokens.Colors.textPrimary)
                Spacer(minLength: Tokens.Spacing.space2)
                Picker(model.repeatLabel, selection: $model.repeatsWeekly) {
                    Text(model.repeatNoneText).tag(false)
                    Text(model.repeatWeeklyText).tag(true)
                }
                .labelsHidden()
                .accessibilityIdentifier("newClass.repeat")
            }
            if let note = model.repeatNoteText {
                Text(note)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("newClass.repeatNote")
            }
        }
        .insetRowLayout()
    }

    private func errorLine(_ text: String, id: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Image(systemName: FieldErrorStyle.systemImage)
                .imageScale(.small)
                .foregroundStyle(Tokens.Colors.statusDangerFg)
                .accessibilityHidden(true)
            Text(text)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .foregroundStyle(Tokens.Colors.statusDangerText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }
}
