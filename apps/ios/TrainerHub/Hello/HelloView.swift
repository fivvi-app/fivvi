import SwiftUI
import TrainerHubDesignTokens

/// The hello screen: a spinner while loading, the greeting as the heading, or an error with "Try again".
/// Colours and text styles come from the design tokens: adaptive colours for light and dark mode, Dynamic Type styles.
struct HelloView: View {
    let model: HelloViewModel

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    .padding(Tokens.Spacing.gutter)
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height)
            }
        }
        .foregroundStyle(Tokens.Colors.textPrimary)
        .background(Tokens.Colors.bgCanvas)
        .environment(\.locale, model.catalog.formattingLocale)
        .task { await model.load() }
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
                .buttonStyle(.primary)
                .accessibilityIdentifier("hello.retry")
            }
        }
    }
}
