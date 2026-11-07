#if DEBUG
import SwiftUI
import FivviDesignTokens

/// Debug-only: the kit's building blocks on one screen, inside the system's tab bar and navigation bar, so UI tests can
/// check them as a person sees them (E020 AC8, AC14) and a developer can compare them with the prototype. Launch the
/// Debug app with `-UITestKitGallery YES`. Release builds do not contain it. Every text comes from the string catalog;
/// the names and times are synthetic data.
enum KitGallery {
    static let key = "UITestKitGallery"

    /// Synthetic client names.
    static let names = ["Anna de Vries", "Bram Jansen", "Chloe Smit", "Daan Bakker", "Eva Mulder", "Finn Visser"]

    static let variantKey = "UITestKitGalleryVariant"

    static func isRequested(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    /// The variant of the gallery's first screen a test asked for (`-UITestKitGalleryVariant <name>`); nil is the kit's
    /// own screen.
    static func variant(defaults: UserDefaults = .standard) -> KitGalleryVariant? {
        defaults.string(forKey: variantKey).flatMap(KitGalleryVariant.init(rawValue:))
    }
}

/// The kit's screen with one part left out or done another way. When the tab bar doesn't minimise on the kit's screen
/// (it didn't on iOS 26.2 before E020's last round), the UI test launches each of these and says which ones do, which
/// tells what keeps the system from tracking the scroll view. Debug-only, like the gallery.
enum KitGalleryVariant: String, CaseIterable {
    /// None of the next four: the same rows in a scroll view, a static inline title.
    case bare
    /// Without the canvas behind the navigation container.
    case noCanvas
    /// Without the toast overlay.
    case noToast
    /// A static inline title instead of the one that appears once the large title has scrolled away (no scroll
    /// observer, no toolbar items for the title).
    case staticTitle
    /// A static inline title, with the scroll observer that the kit's title uses, but not driving anything.
    case observerOnly
    /// The canvas as a `background` of the scroll view (how the kit drew it before), the rest as the kit.
    case wrappedScrollView

    var hasCanvas: Bool { self != .noCanvas && self != .bare && self != .wrappedScrollView }
    var hasToast: Bool { self != .noToast && self != .bare }
    var hasKitTitle: Bool { self == .noCanvas || self == .noToast || self == .wrappedScrollView }
    var observesScroll: Bool { self == .observerOnly }
}

struct KitGalleryView: View {
    let catalog: Catalog
    var variant: KitGalleryVariant? = KitGallery.variant()
    @State private var page = Page.blocks

    private enum Page: Hashable {
        case blocks, other
    }

    var body: some View {
        TabView(selection: $page) {
            Tab(catalog[.clientsTitle], systemImage: "person.2", value: Page.blocks) {
                NavigationStack { KitGalleryBlocks(catalog: catalog, variant: variant) }
            }
            // A plain list in a plain navigation stack, nothing of the kit: when the tab bar doesn't shrink on a
            // screen of the kit, the UI test scrolls this one to tell the kit's structure from the system.
            Tab(catalog[.profileTitle], systemImage: "person.crop.circle", value: Page.other) {
                NavigationStack {
                    List(0..<60, id: \.self) { index in
                        Text(KitGallery.names[index % KitGallery.names.count])
                    }
                    .navigationTitle(catalog[.profileTitle])
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
    let variant: KitGalleryVariant?
    @State private var observed = false
    @State private var showsSheet = false
    @State private var showsAlert = false
    @State private var toast: ToastMessage?
    @State private var name = ""
    @State private var email = ""
    @State private var roundTaps = 0
    private let slot = "10:00 – 11:00"
    private let time = "12:30"
    private let clients = KitGallery.names

    private var title: String { catalog[.clientsTitle] }
    private var eyebrow: String { DateEyebrow.text(for: .now, locale: catalog.formattingLocale) }

    var body: some View {
        screen.toastIf(variant?.hasToast ?? true, $toast)
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

    @ViewBuilder private var screen: some View {
        if let variant {
            variantList(variant)
        } else {
            LargeTitleScreen(title: title, eyebrow: eyebrow, subtitle: "10:00 – 17:30") { blocks }
        }
    }

    /// The kit's screen as `LargeTitleScreen` builds it, but with the parts `variant` leaves out.
    private func variantList(_ variant: KitGalleryVariant) -> some View {
        InsetGroupedList {
            LargeTitleHeader(title: title, eyebrow: eyebrow, subtitle: "10:00 – 17:30")
        } content: {
            blocks
        }
        .applying(variant.hasCanvas) { $0.fivviCanvas() }
        .applying(variant == .wrappedScrollView) { $0.background(Tokens.Colors.bgCanvas) }
        .applying(variant.hasKitTitle) { $0.inlineTitleOnceScrolledAway(title) }
        .applying(!variant.hasKitTitle) { $0.navigationTitle(title).navigationBarTitleDisplayMode(.inline) }
        .applying(variant.observesScroll) { content in
            content.onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y > 40 } action: { _, new in
                observed = new
            }
        }
    }

    @ViewBuilder private var blocks: some View {
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
                    .accessibilityIdentifier("kit.field.invalid")
            }
            FormField(label: catalog[.clientsEmailLabel]) {
                TextField(catalog[.clientsEmailLabel], text: $email)
                    .accessibilityIdentifier("kit.field.valid")
            }
        }
        buttons
    }

    private func address(of client: String) -> String {
        "\(client.lowercased().prefix(4))@example.com"
    }

    private var next: some View {
        NextCard(
            tone: .privateSession, caption: catalog[.clientProfileOverview], title: clients[0], subtitle: slot
        ) {
            NextCardButton(title: catalog[.clientProfileEdit]) {}
            NextCardIconButton(systemImage: "plus", label: catalog[.clientsNewClient]) {}
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
            HStack(spacing: Tokens.Spacing.space4) {
                // On a dark backdrop: a translucent control would show it through, a solid one doesn't.
                RoundControl(systemImage: "plus", label: catalog[.clientsNewClient], prominent: true) {}
                    .accessibilityIdentifier("kit.round.prominent")
                    .padding(Tokens.Spacing.space2)
                    .background(Tokens.Colors.textPrimary, in: .circle)
                RoundControl(systemImage: "plus", label: catalog[.clientsNewClient]) { roundTaps += 1 }
                    .accessibilityIdentifier("kit.round.regular")
                // How often the regular one was tapped: a number, so there is no text to translate.
                Text(verbatim: String(roundTaps))
                    .numericFont(Tokens.TextStyle.title2)
                    .accessibilityIdentifier("kit.round.taps")
            }
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

private extension View {
    @ViewBuilder func applying<Result: View>(_ condition: Bool, _ transform: (Self) -> Result) -> some View {
        if condition { transform(self) } else { self }
    }

    /// A toast on this screen, or none: a variant of the gallery leaves it out. Long enough for a slow test runner to
    /// read it.
    @ViewBuilder func toastIf(_ shown: Bool, _ message: Binding<ToastMessage?>) -> some View {
        if shown {
            toast(message, duration: .seconds(6))
        } else {
            self
        }
    }
}
#endif
