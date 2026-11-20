import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// PS-04 *Nieuwe privésessie* (F020), the sheet of **+** → *Privésessie*: *Annuleren* and *Opslaan* in the navigation
/// bar and a `Form` with the client (a searchable list with the quick add), the date, the start, the length, *Eindigt
/// om…*, the trainer (an Owner chooses, a Trainer is fixed), the location and whether the client gets the
/// confirmation. Leaving with something entered asks first. Without a connection the form says so and *Opslaan* is off.
struct NewSessionView: View {
    @Bindable var model: NewSessionViewModel
    let clients: ClientsViewModel
    let language: AppLanguage
    let canAddClients: Bool
    /// The API planned the session.
    let onSaved: (Components.Schemas.Session) -> Void
    let onCancel: () -> Void
    @State private var confirmingDiscard = false

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Form { content }
            .scrollContentBackground(.hidden)
            .background(Tokens.Colors.bgCanvas)
            .navigationTitle(catalog[.sessionFormTitle])
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(catalog[.sessionFormTitle])
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("newSession.title")
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(catalog[.sessionFormCancel], action: cancel)
                        .accessibilityIdentifier("newSession.cancel")
                }
                ToolbarItem(placement: .confirmationAction) { saveButton }
            }
            .interactiveDismissDisabled(model.isDirty)
            .confirmationDialog(
                catalog[.sessionFormDiscardTitle], isPresented: $confirmingDiscard, titleVisibility: .visible
            ) {
                Button(catalog[.sessionFormDiscard], role: .destructive, action: onCancel)
                    .accessibilityIdentifier("newSession.discard")
                Button(catalog[.sessionFormKeepEditing], role: .cancel) {}
                    .accessibilityIdentifier("newSession.keepEditing")
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
                    .accessibilityIdentifier("newSession.doubleBooking.back")
                Button(model.doubleBookingSaveAnywayText) { Task { await saveAnyway() } }
                    .accessibilityIdentifier("newSession.doubleBooking.saveAnyway")
            } message: {
                Text(model.doubleBookingMessage)
            }
            .task { await model.start() }
            .onReturnToForeground { if model.isOffline { await model.start() } }
            .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
            .environment(\.locale, catalog.formattingLocale)
            .environment(\.timeZone, model.workspace.timeZone)
    }

    /// *Toch opslaan* of PS-07: the same request again, saved whatever the trainer has then.
    private func saveAnyway() async {
        if let session = await model.save(allowConflicts: true) { onSaved(session) }
    }

    private func cancel() {
        if model.isDirty { confirmingDiscard = true } else { onCancel() }
    }

    @ViewBuilder private var saveButton: some View {
        if model.isSaving {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("newSession.pending")
        } else {
            Button(catalog[.sessionFormSave]) {
                Task { if let session = await model.save() { onSaved(session) } }
            }
            .fontWeight(.semibold)
            .disabled(!model.canSave)
            .accessibilityIdentifier("newSession.save")
        }
    }

    @ViewBuilder private var content: some View {
        if let offline = model.offlineText {
            Section {
                notice(offline, kind: .info, id: "newSession.offline")
                retryButton
            }
        }
        switch model.load {
        case .loading:
            Section {
                ProgressView()
                    .tint(Tokens.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(catalog[.commonLoading])
                    .accessibilityIdentifier("newSession.loading")
            }
        case .failed:
            Section {
                notice(model.loadFailedText, kind: .error, id: "newSession.loadFailed")
                retryButton
            }
        case .offline:
            EmptyView()
        case .noPermission:
            Section {
                notice(
                    catalog.string(.noPermissionBody, model.workspace.name), kind: .info, id: "newSession.noPermission"
                )
            }
        case .ready:
            fields
        }
    }

    @ViewBuilder private var fields: some View {
        Section {
            NavigationLink {
                ClientPickerView(
                    model: clients, language: language, canAdd: canAddClients, onPick: { model.client = $0 }
                )
            } label: {
                clientRow
            }
            .accessibilityIdentifier("newSession.client")
        } footer: {
            if let error = model.clientErrorText {
                Text(error)
                    .foregroundStyle(Tokens.Colors.statusDangerFg)
                    .accessibilityIdentifier("newSession.clientError")
            }
        }
        SessionTimeSection(time: model.time, dateLabel: catalog[.sessionFormDateLabel], idPrefix: "newSession")
        Section {
            trainerRow
            Text(model.locationText)
                .font(.system(Tokens.TextStyle.body))
                .accessibilityIdentifier("newSession.location")
        } footer: {
            if let error = model.trainerErrorText {
                Text(error)
                    .foregroundStyle(Tokens.Colors.statusDangerFg)
                    .accessibilityIdentifier("newSession.trainerError")
            }
        }
        if model.client != nil {
            Section {
                Toggle(isOn: $model.notify) { Text(model.notifyText) }
                    .accessibilityIdentifier("newSession.notify")
            } footer: {
                if let note = model.notifyNote {
                    Text(note).accessibilityIdentifier("newSession.notifyNote")
                }
            }
        }
        if let failure = model.saveFailureText {
            Section { notice(failure, kind: .error, id: "newSession.failed") }
        }
    }

    private var retryButton: some View {
        Button(catalog[.commonRetry]) { Task { await model.start() } }
            .frame(minHeight: 44)
            .accessibilityIdentifier("newSession.retry")
    }

    private var clientRow: some View {
        HStack {
            Text(catalog[.sessionFormClientLabel])
                .foregroundStyle(Tokens.Colors.textPrimary)
            Spacer()
            Text(model.clientText)
                .foregroundStyle(model.client == nil ? Tokens.Colors.textSecondary : Tokens.Colors.textPrimary)
                .accessibilityIdentifier("newSession.clientName")
        }
        .frame(minHeight: 44)
    }

    /// An Owner chooses among the trainers (themself first); a Trainer plans for themself and sees their own name.
    @ViewBuilder private var trainerRow: some View {
        if model.forAnyTrainer {
            Picker(model.trainerLabel, selection: $model.trainerID) {
                if model.trainerID.isEmpty {
                    Text(catalog.string(.sessionFormTrainerChoose, model.words.aWord)).tag("")
                }
                ForEach(model.trainers, id: \.id) { trainer in
                    Text(model.trainerText(trainer)).tag(trainer.id)
                }
            }
            .accessibilityIdentifier("newSession.trainer")
        } else {
            LabeledContent(model.trainerLabel) {
                Text(model.ownTrainerText)
                    .accessibilityIdentifier("newSession.trainerFixed")
            }
        }
    }

    private func notice(_ text: String, kind: StatusMessage.Kind, id: String) -> some View {
        StatusMessage(text: text, kind: kind, id: id)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
    }
}
