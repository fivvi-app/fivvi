import SwiftUI

/// Runs `action` when the app comes back from the background, not when it first becomes active: a screen that loads on
/// opening would otherwise load twice at launch (F003: the apps read the person's workspaces on opening and on
/// foreground).
private struct ForegroundRefresh: ViewModifier {
    let action: @MainActor () async -> Void
    @Environment(\.scenePhase) private var scenePhase
    @State private var wasInBackground = false

    func body(content: Content) -> some View {
        content.onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                wasInBackground = true
            case .active where wasInBackground:
                wasInBackground = false
                Task { await action() }
            default:
                break
            }
        }
    }
}

extension View {
    /// Calls `action` each time the app returns to the foreground after it was in the background.
    func onReturnToForeground(_ action: @escaping @MainActor () async -> Void) -> some View {
        modifier(ForegroundRefresh(action: action))
    }
}
