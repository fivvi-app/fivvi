// E020 AC8: SwiftLint must reject every line marked `expect: no_glass_imitation`, and nothing else. Liquid Glass comes
// from the system's components (tab bar, toolbar buttons, sheets, alerts, `.glass` button styles, `glassEffect`), never
// from a copy of it. scripts/test-ios.sh lints this file and compares the reported lines with the markers. It is not
// part of any target.
import SwiftUI
import UIKit

struct GlassImitation: View {
    let title: String

    var body: some View {
        VStack {
            Text(title).background(.ultraThinMaterial) // expect: no_glass_imitation
            Text(title).background(.regularMaterial, in: Capsule()) // expect: no_glass_imitation
            Text(title).background(.thickMaterial) // expect: no_glass_imitation
            Text(title).background(.bar) // expect: no_glass_imitation
            Rectangle().fill(.ultraThinMaterial) // expect: no_glass_imitation
            Rectangle().fill(.bar) // expect: no_glass_imitation
            Text(title).background(Material.ultraThin) // expect: no_glass_imitation
            Text(title).background(Material.bar) // expect: no_glass_imitation
            Rectangle().fill(Material.thin) // expect: no_glass_imitation
            Text(title).containerBackground(.bar, for: .navigation) // expect: no_glass_imitation
            Text(title).backgroundStyle(.bar) // expect: no_glass_imitation
            Text(title).glassEffect(.regular, in: .capsule)
            Button(title) {}.buttonStyle(.glass)
        }
        .toolbarBackground(.visible, for: .navigationBar) // expect: no_glass_imitation
        .toolbarBackgroundVisibility(.visible, for: .tabBar) // expect: no_glass_imitation
        .presentationBackground(.regularMaterial) // expect: no_glass_imitation
    }
}

struct BlurView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIVisualEffectView { // expect: no_glass_imitation
        UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial)) // expect: no_glass_imitation
    }

    func updateUIView(_ view: UIVisualEffectView, context: Context) {} // expect: no_glass_imitation

    func toolbar() {
        let bar = UIToolbar() // expect: no_glass_imitation
        let look = UIToolbarAppearance() // expect: no_glass_imitation
        bar.standardAppearance = look
    }

    func appearances() {
        let bar = UIBarAppearance() // expect: no_glass_imitation
        let button = UIBarButtonItemAppearance() // expect: no_glass_imitation
        let item = UITabBarItemAppearance() // expect: no_glass_imitation
        UIBarButtonItem.appearance().tintColor = nil // expect: no_glass_imitation
        UITabBarItem.appearance().badgeColor = nil // expect: no_glass_imitation
        _ = (bar, button, item)
    }

    func style() {
        let bar = UITabBarAppearance() // expect: no_glass_imitation
        UITabBar.appearance().standardAppearance = bar // expect: no_glass_imitation
        UINavigationBar.appearance().tintColor = nil // expect: no_glass_imitation
    }
}
