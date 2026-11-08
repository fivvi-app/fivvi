#if DEBUG
    import SwiftUI

    /// What opens a link in a UI test (Debug only: the file and its call in `FivviProApp` are not in Release). A UI test
    /// runs in another process and can't see which address the app handed to `openURL`, and the system browser would
    /// answer from the network. With the launch argument `-UITestRecordOpenedLinks YES` the app opens nothing: it shows
    /// the address (a dash before the first) in a line with the id `uitest.openedLink`, which the test reads.
    struct OpenedLinksRecorder: ViewModifier {
        /// Debug-only launch argument: `YES` records the links instead of opening them.
        static let key = "UITestRecordOpenedLinks"

        static func isOn(defaults: UserDefaults = .standard) -> Bool {
            defaults.bool(forKey: key)
        }

        let isOn: Bool
        @State private var last: URL?

        func body(content: Content) -> some View {
            if isOn {
                content
                    .environment(\.openURL, OpenURLAction { url in
                        last = url
                        return .handled
                    })
                    .overlay(alignment: .top) {
                        Text(verbatim: last?.absoluteString ?? "-")
                            .font(.caption2)
                            .allowsHitTesting(false)
                            .accessibilityIdentifier("uitest.openedLink")
                    }
            } else {
                content
            }
        }
    }

    extension View {
        /// Records the links the app opens instead of opening them, when a UI test asked for it.
        func recordingOpenedLinks(_ isOn: Bool = OpenedLinksRecorder.isOn()) -> some View {
            modifier(OpenedLinksRecorder(isOn: isOn))
        }
    }
#endif
