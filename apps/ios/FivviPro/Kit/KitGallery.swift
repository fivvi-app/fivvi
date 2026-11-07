#if DEBUG
import SwiftUI
import FivviDesignTokens

/// Debug-only: the kit's building blocks on one screen, inside the system's tab bar and navigation bar, so UI tests can
/// check them as a person sees them (E020 AC8, AC14) and a developer can compare them with the prototype. Launch the
/// Debug app with `-UITestKitGallery YES`. Release builds do not contain it. Every text comes from the string catalog;
/// the names and times are synthetic data.
enum KitGallery {
    static let key = "UITestKitGallery"

    static func isRequested(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }
}

struct KitGalleryView: View {
    let catalog: Catalog
    @State private var page = Page.blocks

    private enum Page: Hashable {
        case blocks, other
    }

    var body: some View {
        TabView(selection: $page) {
            Tab(catalog[.clientsTitle], systemImage: "person.2", value: Page.blocks) {
                NavigationStack { KitGalleryBlocks(catalog: catalog) }
            }
            Tab(catalog[.profileTitle], systemImage: "person.crop.circle", value: Page.other) {
                NavigationStack {
                    LargeTitleScreen(title: catalog[.profileTitle]) {
                        InsetGroup(header: catalog[.myProfileDetailsTitle]) {
                            InsetRow(title: catalog[.myProfileNameLabel], value: "Sarah")
                            InsetRow(title: catalog[.myProfileEmailLabel], value: "sarah@example.com")
                        }
                    }
                }
            }
        }
        .fivviTabBar()
        .tint(Tokens.Colors.accentText)
        .environment(\.locale, catalog.formattingLocale)
    }
}

private struct KitGalleryBlocks: View {
    let catalog: Catalog
    @State private var showsSheet = false
    @State private var showsAlert = false
    @State private var toast: ToastMessage?
    @State private var name = ""
    private let slot = "10:00 – 11:00"
    private let time = "12:30"
    private let clients = ["Anna de Vries", "Bram Jansen", "Chloe Smit", "Daan Bakker", "Eva Mulder", "Finn Visser"]

    var body: some View {
        LargeTitleScreen(
            title: catalog[.clientsTitle],
            eyebrow: DateEyebrow.text(for: .now, locale: catalog.formattingLocale),
            subtitle: "10:00 – 17:30"
        ) {
            next
            InsetGroup(header: catalog[.clientsTitle], footer: catalog[.clientsEmpty]) {
                ForEach(clients, id: \.self) { client in
                    Button {} label: {
                        InsetRow(title: client, subtitle: address(of: client), showsChevron: true)
                    }
                    .buttonStyle(.insetRow)
                    .accessibilityIdentifier("kit.row.\(client)")
                }
            }
            pills
            InsetGroup {
                FormField(label: catalog[.clientsNameLabel], error: catalog[.clientsNameRequired]) {
                    TextField(catalog[.clientsNameLabel], text: $name)
                }
                FormField(label: catalog[.clientsEmailLabel]) {
                    TextField(catalog[.clientsEmailLabel], text: $name)
                }
            }
            buttons
        }
        .toast($toast)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showsAlert = true } label: { Image(systemName: "trash") }
                    .accessibilityLabel(catalog[.signOutLabel])
                    .accessibilityIdentifier("kit.alertButton")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showsSheet = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(catalog[.clientsNewClient])
                    .accessibilityIdentifier("kit.sheetButton")
            }
        }
        .sheet(isPresented: $showsSheet) {
            NavigationStack {
                Text(catalog[.clientsNewClient])
                    .font(.system(Tokens.TextStyle.title2, weight: .bold))
                    .accessibilityIdentifier("kit.sheet")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(catalog[.commonCancel]) { showsSheet = false }
                        }
                    }
            }
            .presentationDetents([.medium])
        }
        .alert(catalog[.noAccessTitle], isPresented: $showsAlert) {
            Button(catalog[.commonCancel], role: .cancel) {}
            Button(catalog[.signOutLabel], role: .destructive) {}
        } message: {
            Text(catalog[.noAccessBody])
        }
    }

    private func address(of client: String) -> String {
        "\(client.lowercased().prefix(4))@example.com"
    }

    private var next: some View {
        NextCard(
            tone: .privateSession, caption: catalog[.clientProfileOverview], title: clients[0], subtitle: slot
        ) {
            Button(catalog[.clientProfileEdit]) {}
            RoundControl(systemImage: "plus", label: catalog[.clientsNewClient]) {}
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("kit.next")
    }

    private var pills: some View {
        Card {
            HStack(spacing: Tokens.Spacing.space2) {
                StatusPill(text: catalog[.rolesOwner], kind: .success)
                StatusPill(text: catalog[.rolesTrainer], kind: .warning)
                StatusPill(text: "3/8")
                StatusPill(text: catalog[.clientsNotSaved], kind: .danger)
            }
            Text(time)
                .numericFont(Tokens.TextStyle.numericXl, weight: .bold)
                .accessibilityIdentifier("kit.number")
        }
    }

    private var buttons: some View {
        VStack(spacing: Tokens.Spacing.space6) {
            Button(catalog[.clientsSubmit]) { toast = ToastMessage(kind: .success, text: catalog[.myProfileSaved]) }
                .buttonStyle(.pill())
                .accessibilityIdentifier("kit.pill")
            PillButtonStack {
                Button(catalog[.clientsSubmit]) {}
                    .buttonStyle(.pill())
                    .accessibilityIdentifier("kit.stack.first")
                Button(catalog[.myProfileEditName]) {
                    toast = ToastMessage(kind: .warning, text: catalog[.myProfileErrorsNoConnection])
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("kit.stack.second")
                Button(catalog[.signOutLabel]) {}
                    .buttonStyle(.pill(.destructive))
                    .accessibilityIdentifier("kit.stack.third")
            }
        }
    }
}
#endif
