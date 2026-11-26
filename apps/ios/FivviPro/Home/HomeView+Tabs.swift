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

/// What *Hele studio* depends on: the workspace on screen, the word it uses for its trainers (F068: the account is read
/// again and the word may have changed on the web; `configure` then only takes the new word, it keeps the day on screen)
/// and whether its calendar may be managed.
struct StudioKey: Hashable {
    let workspaceID: String?
    let trainerWord: Components.Schemas.TrainerWord?
    let canManage: Bool

    init(workspace: CurrentWorkspace?, canManage: Bool) {
        workspaceID = workspace?.id
        trainerWord = workspace?.trainerWord
        self.canManage = canManage
    }
}

extension HomeView {
    /// A session or class date was cancelled on TD-02 or TD-03: Vandaag and the days of Agenda read again, so they show it
    /// (F026 AC3).
    func personalChanged() async {
        await today.load()
        await agenda.load()
    }

    var studioKey: StudioKey {
        StudioKey(workspace: account.workspace, canManage: account.capabilities.allows(.calendar_manage))
    }

    /// TD-01 *Vandaag*, with its own stack: a row opens TD-02 or TD-03 of the item's workspace, and *‹ Vandaag* returns.
    var todayStack: some View {
        NavigationStack(path: $todayPath) {
            TodayView(
                model: today,
                studio: studio,
                canPlan: account.capabilities.allows(.session_private_manage_own)
                    || account.capabilities.allows(.session_private_manage_any),
                onPlan: { openNewSession(from: .today, start: $0) },
                onOpen: { todayPath.append(PersonalRoute($0)) },
                onOpenTomorrow: { date in
                    agenda.open(day: date)
                    calendarPath = []
                    tab = .calendar
                }
            )
            .task { await today.load() }
            // The Owner's *Hele studio* (F014): who may have it follows the workspace and its capabilities.
            .task(id: studioKey) {
                await studio.configure(
                    workspace: account.workspace, canManage: account.capabilities.allows(.calendar_manage)
                )
            }
            .toolbar { newMenu(from: .today, enabled: !today.isOffline) }
            .navigationDestination(for: PersonalRoute.self) { route in
                PersonalDestination(
                    route: route, api: api, language: language, account: account, connectivity: connectivity,
                    attendance: attendance, onTakeAttendance: { todayPath.append(.attendance($0)) },
                    onCancelled: { Task { await personalChanged() } }
                )
            }
        }
    }

    /// TD-04 *Agenda*, with its own stack: a session opens TD-02 or TD-03 of its workspace, and *‹ Agenda* returns.
    /// *Vandaag* in the bar jumps back to today.
    var calendarStack: some View {
        NavigationStack(path: $calendarPath) {
            AgendaView(model: agenda, onOpen: { calendarPath.append(PersonalRoute($0)) })
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button(catalog[.calendarToday]) { agenda.goToToday() }
                            .accessibilityIdentifier("calendar.today")
                    }
                }
                // **+** in the bar as in the prototype (Agenda's "Nieuw"), off without a connection as on Vandaag.
                .toolbar { newMenu(from: .calendar, enabled: !agenda.isOffline) }
                .navigationDestination(for: PersonalRoute.self) { route in
                    PersonalDestination(
                        route: route, api: api, language: language, account: account, connectivity: connectivity,
                        attendance: attendance, onTakeAttendance: { calendarPath.append(.attendance($0)) },
                        onCancelled: { Task { await personalChanged() } }
                    )
                }
        }
    }
}
