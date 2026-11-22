import SwiftUI

extension View {
    /// Opens TD-03 of the class date named by the Debug-only launch argument `-UITestOpenClassDate <id>` once the home is
    /// ready. The app has no list of class dates yet (the calendars are F013 and F014), so a UI test reaches a class date
    /// that was not just created, such as a Trainer's, only this way. Release builds don't have it: this returns `self`.
    func openingClassDateForUITest(path: Binding<[HomeView.Route]>, ready: Bool) -> some View {
        #if DEBUG
            modifier(UITestClassDateRoute(path: path, ready: ready))
        #else
            self
        #endif
    }
}

#if DEBUG
    private struct UITestClassDateRoute: ViewModifier {
        static let key = "UITestOpenClassDate"
        @Binding var path: [HomeView.Route]
        let ready: Bool
        @State private var opened = false

        func body(content: Content) -> some View {
            content.onChange(of: ready, initial: true) { _, ready in
                guard ready, !opened, let id = UserDefaults.standard.string(forKey: Self.key) else { return }
                opened = true
                path.append(.classDate(id, added: nil))
            }
        }
    }
#endif
