import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// What the signed-in home does for attendance's offline queue (F025): it sends what the phone kept once the app is open,
/// on returning to the foreground and when the phone is online again, and tells the lists that show sessions to read again
/// each time a request leaves the queue.
private struct AttendanceQueueLifecycle: ViewModifier {
    let queue: AttendanceQueue
    let connectivity: Connectivity
    let onSettled: @MainActor () async -> Void

    func body(content: Content) -> some View {
        content
            .task { await queue.flush() }
            .onChange(of: connectivity.isOnline) { _, online in
                if online { Task { await queue.flush() } }
            }
            .onChange(of: queue.revision) { Task { await onSettled() } }
    }
}

extension View {
    func attendanceQueueLifecycle(
        queue: AttendanceQueue, connectivity: Connectivity, onSettled: @escaping @MainActor () async -> Void
    ) -> some View {
        modifier(AttendanceQueueLifecycle(queue: queue, connectivity: connectivity, onSettled: onSettled))
    }
}

/// *Uitloggen* (F001) with the warning of F025: attendance still waiting for a connection is lost at sign-out, so the button
/// asks first ("Aanwezigheid nog niet verstuurd") when something waits.
struct SignOutButton: View {
    let catalog: Catalog
    let isSigningOut: Bool
    /// How many requests wait in the attendance queue.
    let waiting: Int
    let onSignOut: () async -> Void
    @State private var confirming = false

    var body: some View {
        if isSigningOut {
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(catalog[.commonLoading])
                .accessibilityIdentifier("home.signingOut")
        } else {
            PillButtonStack {
                Button {
                    if waiting == 0 {
                        Task { await onSignOut() }
                    } else {
                        confirming = true
                    }
                } label: {
                    Text(catalog[.signOutLabel])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("home.signOut")
                .confirmationDialog(
                    catalog[.attendanceSignOutTitle], isPresented: $confirming, titleVisibility: .visible
                ) {
                    Button(catalog[.attendanceSignOutConfirm], role: .destructive) { Task { await onSignOut() } }
                        .accessibilityIdentifier("home.signOut.confirm")
                    Button(catalog[.commonCancel], role: .cancel) {}
                } message: {
                    Text(catalog.string(.attendanceSignOutMessage, waiting))
                }
            }
        }
    }
}
