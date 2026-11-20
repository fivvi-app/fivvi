import SwiftUI
import FivviAPI
import FivviLanguage
import FivviSession
import FivviStrings
import FivviUI

/// The frame of the client app (PRODUCT.md §55): the system's `TabView` with the tabs *Home · Boeken · Profiel* (SF
/// Symbols; *Activiteit* comes with M7), and above the content of each tab the offline banner while the phone has no
/// connection (E017 AC9). The shell queues nothing while offline; a later feature decides what it sends.
struct ClientTabsView: View {
    /// The tabs, in the order of the bar.
    enum ClientTab: Hashable {
        case home, book, profile
    }

    @State private var account: AccountViewModel
    @State private var selection = ClientTab.home
    private let language: AppLanguage
    private let connectivity: Connectivity

    private var catalog: Catalog { language.catalog }

    /// `onAccount` is told the account's ID once `GET /api/v1/me` has answered; the app passes it to error reporting.
    /// `onSignedOut` runs after the person signed out and the token is gone; its argument says whether the API refused
    /// the token of the sign-out call.
    init(
        api: any APIProtocol, store: any SessionStore, language: AppLanguage, connectivity: Connectivity,
        onAccount: @escaping (String) -> Void,
        onSignedOut: @escaping (Bool) -> Void
    ) {
        _account = State(initialValue: AccountViewModel(
            api: api, store: store, onAccount: onAccount, onSignedOut: onSignedOut,
            onPreferredLocale: { language.startRead() }
        ))
        self.language = language
        self.connectivity = connectivity
    }

    var body: some View {
        TabView(selection: $selection) {
            Tab(catalog[.clientNavHome], systemImage: "house", value: ClientTab.home) {
                tab {
                    NoWorkspaceView(state: account.state, catalog: catalog, ids: .home, onRetry: reload)
                }
            }
            Tab(catalog[.clientNavBook], systemImage: "calendar", value: ClientTab.book) {
                tab {
                    NoWorkspaceView(state: account.state, catalog: catalog, ids: .book, onRetry: reload)
                }
            }
            Tab(catalog[.clientNavProfile], systemImage: "person.crop.circle", value: ClientTab.profile) {
                tab {
                    ProfileView(
                        account: account, language: language, version: AppConfiguration.version(), onRetry: reload
                    )
                }
            }
        }
        .fivviTabBar()
        // A language chosen before signing in, or in iOS Settings, is saved first; then the account's stored language is
        // read, so an older stored one can't override it (F010).
        .task {
            await language.save()
            await account.load()
        }
        // Coming back to the app asks again: a team role gained or lost elsewhere shows, and a language changed on the
        // web is adopted (F010 AC2).
        .onReturnToForeground {
            await language.save()
            await account.refresh()
        }
        .environment(\.locale, catalog.formattingLocale)
    }

    /// One tab: a navigation stack of its own, with the offline banner above its content.
    private func tab<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        NavigationStack {
            content()
                .offlineBanner(visible: !connectivity.isOnline, text: catalog[.commonOffline], id: "client.offline")
        }
    }

    private func reload() {
        Task { await account.load() }
    }
}
