import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// Owns the model of one client profile for as long as the screen is pushed, so a change of the list behind it doesn't
/// start the profile over.
struct ClientProfileScreen: View {
    @State private var model: ClientProfileViewModel
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    let onOpenExisting: (String) -> Void

    init(
        model list: ClientsViewModel, route: ClientRoute, language: AppLanguage, capabilities: WorkspaceCapabilities,
        onOpenExisting: @escaping (String) -> Void
    ) {
        _model = State(initialValue: route.client.map { list.profile(of: $0, justAdded: route.justAdded) }
            ?? list.profile(id: route.id))
        self.language = language
        self.capabilities = capabilities
        self.onOpenExisting = onOpenExisting
    }

    var body: some View {
        ClientProfileView(
            model: model, language: language, capabilities: capabilities, onOpenExisting: onOpenExisting
        )
    }
}

/// *Klantprofiel* / *Client profile* (TM-03, F006): the client's name as the title, the section *Overzicht* with name,
/// email address and language for emails, and *Bewerken* in the bar for whoever may manage clients (the capability
/// helper decides). The other parts of the profile come with the features that own them; no empty placeholders. The
/// bar's back button is our own (`clientProfile.back`, the id the Maestro flow taps; SwiftUI can't give the system's
/// one an id): the chevron and the title of the list, as the system's shows (IA §5.2), with the swipe back kept.
struct ClientProfileView: View {
    let model: ClientProfileViewModel
    let language: AppLanguage
    let capabilities: WorkspaceCapabilities
    /// *Anna de Vries openen* in the edit form: the profile of that client replaces this one.
    let onOpenExisting: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var editing: ClientFormViewModel?
    /// The client to open once the edit sheet is gone.
    @State private var afterSheet: String?

    private var catalog: Catalog { model.catalog }

    var body: some View {
        List { content }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Tokens.Colors.bgCanvas)
            .navigationTitle(model.title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .background(KeepSwipeBack())
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { backButton }
                ToolbarItem(placement: .principal) {
                    Text(model.title)
                        .font(.headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("clientProfile.title")
                }
                if capabilities.allows(.clients_manage), model.state == .loaded {
                    ToolbarItem(placement: .primaryAction) { editButton }
                }
            }
            .refreshable { await model.refresh() }
            .task(id: model.state == .loading) { await model.watchSlowLoading() }
            .task { if model.state == .loading { await model.load() } else { await model.refresh() } }
            .onReturnToForeground { await model.refresh() }
            .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
            .sheet(item: $editing, onDismiss: openClientAfterSheet) { form in
                NavigationStack { editForm(form) }
                    .presentationDetents([.large])
            }
            .environment(\.locale, catalog.formattingLocale)
    }

    private var backButton: some View {
        Button {
            dismiss()
        } label: {
            HStack(spacing: Tokens.Spacing.space1) {
                Image(systemName: "chevron.left")
                    .fontWeight(.semibold)
                Text(catalog[.clientsTitle])
                    .lineLimit(1)
            }
            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        // The size of a button in the bar is the system's (36 pt high, as the system's own back button).
        .accessibilityLabel(catalog[.clientsTitle])
        .accessibilityIdentifier("clientProfile.back")
    }

    private var editButton: some View {
        Button(catalog[.clientProfileEdit]) {
            editing = model.editForm()
        }
        .accessibilityIdentifier("clientProfile.edit")
    }

    private func editForm(_ form: ClientFormViewModel) -> some View {
        ClientFormView(
            model: form, idPrefix: "clientProfile.edit", submitID: "save", title: catalog[.clientProfileEditTitle],
            submitTitle: catalog[.clientProfileSave],
            onSaved: { client in
                model.didSave(client)
                editing = nil
            },
            onOpenExisting: { id in
                afterSheet = id
                editing = nil
            },
            onCancel: { editing = nil }
        )
        .onChange(of: language.catalog) { _, catalog in form.use(catalog) }
        // The API refused the edit (the helper hides *Bewerken* meanwhile): the sheet goes, as on Android.
        .onChange(of: form.noPermission) { _, refused in if refused { editing = nil } }
    }

    private func openClientAfterSheet() {
        guard let id = afterSheet else { return }
        afterSheet = nil
        onOpenExisting(id)
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            SkeletonRows(label: catalog[.commonLoading], id: "clientProfile.loading")
            if model.loadingSlow {
                StatusMessage(text: catalog[.commonLoadingSlow], kind: .info, id: "clientProfile.loadingSlow")
            }
        case .failed:
            VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
                StatusMessage(text: catalog[.clientsLoadError], kind: .error, id: "clientProfile.error")
                Button {
                    Task { await model.load() }
                } label: {
                    Text(catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("clientProfile.retry")
            }
        case .noPermission:
            StatusMessage(text: catalog[.noPermissionTitle], kind: .info, id: "clientProfile.noPermissionTitle")
                .accessibilityAddTraits(.isHeader)
            StatusMessage(text: model.noPermissionText, kind: .info, id: "clientProfile.noPermission")
        case .loaded:
            overview
        }
    }

    @ViewBuilder private var overview: some View {
        if let added = model.addedText {
            StatusMessage(text: added, kind: .success, id: "clientProfile.added")
        }
        if let saved = model.savedText {
            StatusMessage(text: saved, kind: .success, id: "clientProfile.saved")
        }
        Section {
            fact(catalog[.clientProfileNameLabel], model.client?.name ?? "", id: "clientProfile.name")
            fact(catalog[.clientProfileEmailLabel], model.emailText, id: "clientProfile.email")
            fact(catalog[.clientProfileLocaleLabel], model.localeText, id: "clientProfile.language")
        } header: {
            Text(catalog[.clientProfileOverview])
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("clientProfile.overview")
        }
    }

    private func fact(_ label: String, _ value: String, id: String) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(label)
                .font(.system(Tokens.TextStyle.label))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(value)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(id)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Keeps the swipe from the screen's edge that goes back, which UIKit turns off when the system's back button is
/// replaced by our own. Its recogniser answers to a delegate of ours only while this screen is shown, and only begins
/// where there is a screen to go back to: with no delegate at all, or one left behind, a swipe on the root (Home) can
/// lock the navigation up.
private struct KeepSwipeBack: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Keeper { Keeper() }
    func updateUIViewController(_ controller: Keeper, context: Context) {}

    final class Keeper: UIViewController {
        private let guardian = SwipeBackGuardian()
        private weak var original: UIGestureRecognizerDelegate?
        private weak var recogniser: UIGestureRecognizer?

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let navigation = navigationController, let recogniser = navigation.interactivePopGestureRecognizer
            else { return }
            guardian.navigation = navigation
            if recogniser.delegate !== guardian { original = recogniser.delegate }
            self.recogniser = recogniser
            recogniser.delegate = guardian
            recogniser.isEnabled = true
        }

        override func viewDidDisappear(_ animated: Bool) {
            super.viewDidDisappear(animated)
            if recogniser?.delegate === guardian { recogniser?.delegate = original }
        }
    }
}

/// Lets the edge swipe begin only when the navigation stack has a screen below the one shown.
final class SwipeBackGuardian: NSObject, UIGestureRecognizerDelegate {
    weak var navigation: UINavigationController?

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        (navigation?.viewControllers.count ?? 0) > 1
    }
}
