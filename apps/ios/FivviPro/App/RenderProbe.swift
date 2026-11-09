import SwiftUI

/// Counts how often the body of a screen runs, so a UI test can prove a screen doesn't render without end (#684). The
/// UI test runs in another process: with the launch argument `-UITestCountRenders YES` (Debug only) the app shows the
/// counts in a line with the id `uitest.renders`, `ClientsView=3`, which the test reads. Release builds count
/// nothing.
enum RenderProbe {
    /// Debug-only launch argument: `YES` shows the counts.
    static let key = "UITestCountRenders"

    #if DEBUG
        private static let isOn = UserDefaults.standard.bool(forKey: key)
        private static let lock = NSLock()
        nonisolated(unsafe) private static var counts: [String: Int] = [:]

        static func record(_ view: String) {
            guard isOn else { return }
            lock.withLock { counts[view, default: 0] += 1 }
        }

        static var summary: String {
            lock.withLock { counts.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: " ") }
        }

        static func overlayIsOn() -> Bool { isOn }
    #else
        @inline(__always) static func record(_ view: String) {}
    #endif
}

extension View {
    /// Counts a run of the body this is called in, as `view` (see `RenderProbe`); the view itself is unchanged.
    func countingRenders(_ view: String) -> Self {
        RenderProbe.record(view)
        return self
    }
}

#if DEBUG
    private struct RenderCounts: ViewModifier {
        let isOn: Bool

        func body(content: Content) -> some View {
            if isOn {
                content.overlay(alignment: .bottom) {
                    TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                        Text(verbatim: RenderProbe.summary)
                            .font(.caption2)
                            .allowsHitTesting(false)
                            .accessibilityIdentifier("uitest.renders")
                    }
                }
            } else {
                content
            }
        }
    }

    extension View {
        /// Shows how often the screens rendered, when a UI test asked for it.
        func showingRenderCounts(_ isOn: Bool = RenderProbe.overlayIsOn()) -> some View {
            modifier(RenderCounts(isOn: isOn))
        }
    }
#endif
