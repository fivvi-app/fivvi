// AC6 (#34, #57): SwiftLint must reject every line marked `expect: no_colour_literal`, and nothing else. Colours come
// from the design tokens (`Tokens.Colors`). scripts/test-ios.sh lints this file and compares the reported lines with
// the markers. It is not part of any target.
import SwiftUI
import TrainerHubDesignTokens
import UIKit

struct ColourLiteral: View {
    let title: String

    var body: some View {
        VStack {
            Text(title).foregroundStyle(Color(red: 0.35, green: 0.32, blue: 0.6)) // expect: no_colour_literal
            Text(title).foregroundStyle(Color(.sRGB, white: 0.2)) // expect: no_colour_literal
            Text(title).foregroundStyle(Color(hue: 0.7, saturation: 0.5, brightness: 0.6)) // expect: no_colour_literal
            Text(title).foregroundStyle(Color("Brand")) // expect: no_colour_literal
            Text(title).foregroundStyle(Color(uiColor: .systemPurple)) // expect: no_colour_literal
            Text(title).foregroundStyle(Color.init(white: 0.1)) // expect: no_colour_literal
            Text(title).foregroundStyle(Color.red) // expect: no_colour_literal
            Text(title).foregroundStyle(.blue) // expect: no_colour_literal
            Text(title).foregroundColor(.secondary) // expect: no_colour_literal
            Text(title).background(.black) // expect: no_colour_literal
            Text(title).shadow(color: .black, radius: 2) // expect: no_colour_literal
            Text(title).tint(.purple) // expect: no_colour_literal
            Rectangle().fill(#colorLiteral(red: 1, green: 0, blue: 0, alpha: 1)) // expect: no_colour_literal
            Rectangle().fill(Color(UIColor(red: 0.1, green: 0.2, blue: 0.3, alpha: 1))) // expect: no_colour_literal
            Rectangle().fill(Color(uiColor: UIColor.systemBackground)) // expect: no_colour_literal

            Text(title).foregroundStyle(Tokens.Colors.textPrimary)
            Text(title).background(Tokens.Colors.bgCanvas)
            Text(title).tint(Tokens.Colors.actionPrimaryBg)
            Rectangle().fill(.tint)
            Rectangle().fill(Color.clear)
            Text(title).background(.ultraThinMaterial)
            // Text(title).foregroundStyle(Color.red) in a comment is fine
        }
    }
}
