import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// PS-05 *Sessie verplaatsen* (F020), a sheet of the session screen: where the session is now, the new date, start and
/// length, the location (unchanged), and whether the client gets the change by email. The main button says what
/// happens. The API's `409` and time messages are shown as it words them (`RescheduleViewModel`).
struct RescheduleView: View {
    @Bindable var model: RescheduleViewModel
    let language: AppLanguage
    /// The API moved the session.
    let onMoved: (Components.Schemas.Session) -> Void
    let onCancel: () -> Void

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Form {
            Section {
                Text(model.subtitle)
                    .accessibilityIdentifier("reschedule.subtitle")
                Text(model.currentText)
                    .accessibilityIdentifier("reschedule.current")
            }
            SessionTimeSection(time: model.time, dateLabel: catalog[.rescheduleDateLabel], idPrefix: "reschedule")
            Section {
                Text(model.locationText)
                    .accessibilityIdentifier("reschedule.location")
            }
            Section {
                Toggle(isOn: $model.notify) { Text(model.notifyText) }
                    .accessibilityIdentifier("reschedule.notify")
            } footer: {
                Text(model.notifyNote).accessibilityIdentifier("reschedule.notifyNote")
            }
            if let failure = model.failureText {
                Section {
                    StatusMessage(text: failure, kind: .error, id: "reschedule.failed")
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.Colors.bgCanvas)
        // The main button stays in view, whatever is above it: it says what happens.
        .safeAreaInset(edge: .bottom) { submit.padding(Tokens.Spacing.gutter) }
        .navigationTitle(catalog[.rescheduleTitle])
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(catalog[.rescheduleTitle])
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("reschedule.title")
            }
            ToolbarItem(placement: .cancellationAction) {
                Button(catalog[.rescheduleCancel], action: onCancel)
                    .accessibilityIdentifier("reschedule.cancel")
            }
        }
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .environment(\.locale, catalog.formattingLocale)
        .environment(\.timeZone, model.time.timeZone)
    }

    @ViewBuilder private var submit: some View {
        if model.isSaving {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("reschedule.pending")
        } else {
            PillButtonStack {
                Button {
                    Task { if let moved = await model.save() { onMoved(moved) } }
                } label: {
                    Text(model.submitText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("reschedule.submit")
            }
        }
    }
}
