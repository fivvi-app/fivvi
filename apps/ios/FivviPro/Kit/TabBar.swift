import SwiftUI

extension View {
    /// The tab bar of the app (E020 AC8): the system's floating Liquid Glass bar, which shrinks while the content
    /// scrolls down and grows back when it scrolls up. Apply it to the `TabView`; nothing here draws the bar.
    func fivviTabBar() -> some View {
        tabBarMinimizeBehavior(.onScrollDown)
    }
}
