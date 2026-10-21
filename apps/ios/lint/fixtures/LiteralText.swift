// AC8 (#34): SwiftLint must reject every line marked `expect: no_literal_text`, and nothing else.
// scripts/test-ios.sh lints this file and compares the reported lines with the markers. It is not part of any target.
import SwiftUI

struct LiteralText: View {
    let title: String

    var body: some View {
        VStack {
            Text("Welkom bij Fivvi") // expect: no_literal_text
            Text(verbatim: "Welkom") // expect: no_literal_text
            Button("Opnieuw proberen") {} // expect: no_literal_text
            Label("Laden", systemImage: "hourglass") // expect: no_literal_text
            ProgressView().accessibilityLabel("Laden…") // expect: no_literal_text
            Text(title)
            Button(title) {}
            Label(title, systemImage: "hourglass")
            // Text("A literal in a comment is fine")
        }
        .navigationTitle("Hallo") // expect: no_literal_text
    }
}
