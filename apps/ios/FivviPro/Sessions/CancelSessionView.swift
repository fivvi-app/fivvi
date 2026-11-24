import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// PS-06 *Sessie annuleren?* (F026), a sheet of the session screen: the client and when, *Wie annuleert?* (*De klant* or
/// *Wij*), then, with *De klant*, the question *Al een ander moment voorgesteld?* with **Verplaatsen** (opens PS-05) and
/// *Toch annuleren*, else the email box and the destructive *Sessie annuleren* under *Terug*. The API's `409` words are
/// shown as it words them (`CancelSessionViewModel`); offline the button is off and says so.
struct CancelSessionView: View {
    @Bindable var model: CancelSessionViewModel
    let language: AppLanguage
    /// The API cancelled the session.
    let onCancelled: (Components.Schemas.Session) -> Void
    /// *Verplaatsen* of the question: PS-05 opens for the same session, nothing is cancelled.
    let onReschedule: () -> Void
    /// *Terug*.
    let onBack: () -> Void

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Form {
            Section {
                Text(model.subtitleText)
                    .accessibilityIdentifier("cancel.subtitle")
            }
            Section {
                option(model.whoClientText, .client, id: "cancel.who.client")
                option(model.whoUsText, .workspace, id: "cancel.who.workspace")
            } header: {
                Text(model.whoLabelText).accessibilityIdentifier("cancel.who")
            }
            switch model.step {
            case .nudge: nudge
            case .confirm: confirm
            }
            if let failure = model.failureText {
                Section {
                    StatusMessage(text: failure, kind: model.isOffline ? .info : .error, id: "cancel.failed")
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.Colors.bgCanvas)
        .safeAreaInset(edge: .bottom) { buttons.padding(Tokens.Spacing.gutter) }
        .navigationTitle(model.titleText)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(model.titleText)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("cancel.title")
            }
        }
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .environment(\.locale, catalog.formattingLocale)
    }

    /// One answer to *Wie annuleert?*: a row with a check on the chosen one.
    private func option(_ title: String, _ initiator: CancelSessionViewModel.Initiator, id: String) -> some View {
        Button {
            model.choose(initiator)
        } label: {
            HStack {
                Text(title)
                    .foregroundStyle(Tokens.Colors.textPrimary)
                Spacer(minLength: Tokens.Spacing.space2)
                if model.initiator == initiator {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(model.initiator == initiator ? .isSelected : [])
        .accessibilityIdentifier(id)
    }

    /// *Al een ander moment voorgesteld?* with **Verplaatsen** as the main button and *Toch annuleren* beside it.
    private var nudge: some View {
        Section {
            Text(model.nudgeQuestionText)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .accessibilityIdentifier("cancel.nudge")
            PillButtonStack {
                Button(action: onReschedule) {
                    Text(model.nudgeRescheduleText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("cancel.reschedule")
                Button {
                    model.cancelAnyway()
                } label: {
                    Text(model.nudgeCancelAnywayText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("cancel.cancelAnyway")
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    /// The email box with its note, or, for a session that has started, that nothing is sent.
    @ViewBuilder private var confirm: some View {
        Section {
            if model.started {
                Text(model.startedText)
                    .accessibilityIdentifier("cancel.started")
            } else {
                Toggle(isOn: $model.notify) { Text(model.notifyText) }
                    .accessibilityIdentifier("cancel.notify")
            }
        } footer: {
            if !model.started, let note = model.notifyNote {
                Text(note).accessibilityIdentifier("cancel.notifyNote")
            }
        }
    }

    /// *Terug* under the destructive *Sessie annuleren*, which only the confirm step has.
    @ViewBuilder private var buttons: some View {
        if model.isSaving {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("cancel.pending")
        } else {
            PillButtonStack {
                if model.step == .confirm {
                    Button {
                        Task { if let cancelled = await model.cancel() { onCancelled(cancelled) } }
                    } label: {
                        Text(model.submitText)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pill(.destructive))
                    .disabled(!model.canSubmit)
                    .accessibilityIdentifier("cancel.submit")
                }
                Button(action: onBack) {
                    Text(model.backText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("cancel.back")
            }
        }
    }
}
