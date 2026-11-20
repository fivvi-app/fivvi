import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// PS-04's client list: the workspace's clients with a search, and *+ Nieuwe klant* (the quick add of *Klanten*, the
/// same form) for whoever may manage clients. A row chooses the client and goes back. It reads the clients through the
/// home's `ClientsViewModel`, so a client added here is in *Klanten* too.
struct ClientPickerView: View {
    let model: ClientsViewModel
    let language: AppLanguage
    let canAdd: Bool
    let onPick: (Components.Schemas.Client) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var newClient: ClientFormViewModel?

    private var catalog: Catalog { model.catalog }

    var body: some View {
        VStack(spacing: Tokens.Spacing.space3) {
            SearchPill(text: $searchText, prompt: catalog[.sessionFormClientSearch], identifier: "clientPicker.search")
                .tint(Tokens.Colors.accentText)
                .padding(.horizontal, Tokens.Spacing.space6)
            List { content }
                .listStyle(.plain)
                .scrollDismissesKeyboard(.immediately)
                .scrollContentBackground(.hidden)
        }
        .background(Tokens.Colors.bgCanvas)
        .navigationTitle(catalog[.sessionFormClientLabel])
        .navigationBarTitleDisplayMode(.inline)
        .task(id: searchText) {
            if searchText != model.query {
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
            }
            await model.search(searchText)
        }
        .onDisappear { Task { await model.search("") } }
        .sheet(item: $newClient) { form in
            NavigationStack {
                ClientFormView(
                    model: form, idPrefix: "clientPicker.add", submitID: "submit",
                    title: catalog[.clientsNewClient], submitTitle: catalog[.clientsSubmit],
                    onSaved: { client in
                        model.didAdd(client)
                        newClient = nil
                        pick(client)
                    },
                    onOpenExisting: { id in
                        newClient = nil
                        if let existing = model.clients.first(where: { $0.id == id }) { pick(existing) }
                    },
                    onCancel: { newClient = nil }
                )
            }
            .presentationDetents([.large])
        }
        .environment(\.locale, catalog.formattingLocale)
    }

    private func pick(_ client: Components.Schemas.Client) {
        onPick(client)
        dismiss()
    }

    @ViewBuilder private var content: some View {
        if canAdd { addRow }
        switch model.state {
        case .loading:
            SkeletonRows(label: catalog[.commonLoading], id: "clientPicker.loading")
                .listRowSeparator(.hidden)
        case .failed:
            StatusMessage(text: catalog[.clientsLoadError], kind: .error, id: "clientPicker.error")
        case .noPermission:
            StatusMessage(text: model.noPermissionText, kind: .info, id: "clientPicker.noPermission")
        case .loaded:
            if model.clients.isEmpty {
                Text(catalog[.sessionFormClientNone])
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityIdentifier("clientPicker.noResults")
            }
            ForEach(model.clients, id: \.id) { client in row(client) }
        }
    }

    /// *+ Nieuwe klant* or, once something is typed, *+ Nieuwe klant ‘Anna’*.
    private var addRow: some View {
        let typed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = typed.isEmpty
            ? catalog[.sessionFormClientNew] : catalog.string(.sessionFormClientNewNamed, typed)
        return Button {
            let form = model.newClientForm()
            form.name = typed
            newClient = form
        } label: {
            Text(title)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.actionPrimaryBg)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("clientPicker.add")
    }

    private func row(_ client: Components.Schemas.Client) -> some View {
        Button {
            pick(client)
        } label: {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(client.name)
                    .font(.system(Tokens.TextStyle.body))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                Text(client.email)
                    .font(.system(Tokens.TextStyle.label))
                    .foregroundStyle(Tokens.Colors.textSecondary)
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("clientPicker.row.\(client.id)")
        .task { await model.loadMore(after: client) }
    }
}
