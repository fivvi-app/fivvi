import SwiftUI
import FivviDesignTokens

/// The offline banner of the tabs (E017 AC9): "You're offline. Some information may be out of date." on the top edge of
/// a screen while the phone has no connection. A shared piece, so every app shows the same one. The text is a catalog
/// text (`common.offline`) the screen passes in; the id is the accessibility identifier tests find it by.
public struct OfflineBanner: View {
    let text: String
    let id: String

    public init(text: String, id: String) {
        self.text = text
        self.id = id
    }

    public var body: some View {
        StatusMessage(text: text, kind: .info, id: id)
            .padding(.horizontal, Tokens.Spacing.space4)
            .padding(.vertical, Tokens.Spacing.space2)
            // Read when it appears, so VoiceOver tells the person without a focus move.
            .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
    }
}

extension View {
    /// Shows `banner` above this screen's content, outside its scroll, while `visible`.
    public func offlineBanner(visible: Bool, text: String, id: String) -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            if visible { OfflineBanner(text: text, id: id) }
        }
    }
}
