import SwiftUI
import FivviDesignTokens

/// The hello block: a spinner while loading, the greeting as the heading, or an error with "Try again". It doesn't
/// scroll itself: the screen around it does, so what sits next to it can't squeeze it at the largest text size.
/// Colours and text styles come from the design tokens: adaptive colours for light and dark mode, Dynamic Type styles.
struct HelloView: View {
    let model: HelloViewModel

    var body: some View {
        content
            .padding(Tokens.Spacing.gutter)
            .frame(maxWidth: .infinity)
            .foregroundStyle(Tokens.Colors.textPrimary)
            .environment(\.locale, model.catalog.formattingLocale)
            .task(id: model.catalog.locale) { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(Tokens.Colors.textSecondary)
                .accessibilityLabel(model.catalog[.commonLoading])
                .accessibilityIdentifier("hello.loading")
        case let .loaded(greeting):
            Text(greeting)
                .font(.system(Tokens.TextStyle.display, weight: .semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("hello.greeting")
                .testFlightCrashTrigger()
        case .failed:
            VStack(spacing: Tokens.Spacing.space6) {
                Text(model.catalog[.helloError])
                    .font(.system(Tokens.TextStyle.body))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("hello.error")
                Button {
                    Task { await model.load() }
                } label: {
                    Text(model.catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("hello.retry")
            }
        }
    }
}
