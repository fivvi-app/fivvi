import SwiftUI
import FivviDesignTokens

enum ToastKind {
    case success
    /// An error or a warning: the message comes with a warning icon.
    case warning

    var systemImage: String {
        switch self {
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        }
    }

    fileprivate var tint: Color {
        switch self {
        case .success: Tokens.Colors.statusSuccessFg
        case .warning: Tokens.Colors.statusDangerFg
        }
    }
}

/// A message to show for a moment. A new message has a new `id`, so showing the same text twice shows it twice.
struct ToastMessage: Equatable, Identifiable {
    let id = UUID()
    let kind: ToastKind
    let text: String
}

/// A toast (E020 AC14): a floating glass capsule with an icon and one line, shown above the tab bar for a few seconds.
/// The system draws the glass. VoiceOver announces the text when it appears.
struct ToastView: View {
    let message: ToastMessage

    var body: some View {
        HStack(spacing: Tokens.Spacing.space2) {
            Image(systemName: message.kind.systemImage)
                .foregroundStyle(message.kind.tint)
                .accessibilityHidden(true)
            Text(message.text)
                .foregroundStyle(Tokens.Colors.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("toast.text")
        }
        .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
        .padding(.horizontal, 18)
        .padding(.vertical, Tokens.Spacing.space3)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, Tokens.Spacing.gutter)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("toast")
    }
}

extension View {
    /// Shows `message` as a toast above the bottom edge until `duration` has passed, then empties the binding. The
    /// toast is an overlay: it takes no room from the screen and puts nothing at the bottom edge of the screen's scroll
    /// view, which stays the one the system tracks for the tab bar (a bottom `safeAreaInset` would).
    func toast(_ message: Binding<ToastMessage?>, duration: Duration = .seconds(3)) -> some View {
        overlay(alignment: .bottom) {
            ZStack {
                if let current = message.wrappedValue {
                    ToastView(message: current)
                        .transition(.opacity)
                        .task(id: current.id) {
                            AccessibilityNotification.Announcement(current.text).post()
                            try? await Task.sleep(for: duration)
                            if !Task.isCancelled { message.wrappedValue = nil }
                        }
                }
            }
            .animation(.easeOut(duration: 0.2), value: message.wrappedValue)
        }
    }
}
