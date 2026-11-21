import SwiftUI
import FivviAPI
import FivviLanguage
import FivviStrings
import FivviUI

/// The tabs of the app (F013, `information-architecture.md §5.1`): Vandaag first, then Agenda, then the home of the current
/// workspace (*Klanten*, *Profiel*, the account) until those become tabs of their own.
enum ProTab: Hashable {
    case today, calendar, home

    /// Vandaag, the first tab. A Debug build takes `-UITestStartTab home`, so the tests of the home screens start there.
    static func initial(defaults: UserDefaults = .standard) -> ProTab {
        #if DEBUG
            if defaults.string(forKey: "UITestStartTab") == "home" { return .home }
        #endif
        return .today
    }
}

extension HomeView {
    /// TD-01 *Vandaag*, with its own stack: a row opens TD-02 or TD-03 of the item's workspace, and *‹ Vandaag* returns.
    var todayStack: some View {
        NavigationStack(path: $todayPath) {
            TodayView(
                model: today,
                canPlan: account.capabilities.allows(.session_private_manage_own)
                    || account.capabilities.allows(.session_private_manage_any),
                onPlan: { openNewSession(from: .today, start: $0) },
                onOpen: { todayPath.append(PersonalRoute($0)) },
                onOpenTomorrow: { _ in tab = .calendar }
            )
            .task { await today.load() }
            .toolbar { newMenu(from: .today, enabled: !today.isOffline) }
            .navigationDestination(for: PersonalRoute.self) { route in
                PersonalDestination(route: route, api: api, language: language, account: account)
            }
        }
    }

    /// TD-04 *Agenda*: the week and the month come with their own ticket (#526).
    var calendarStack: some View {
        NavigationStack {
            LargeTitleScreen(title: catalog[.calendarTitle], titleIdentifier: "calendar.title") {}
        }
    }
}
