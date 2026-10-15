import SwiftUI

/// The hello screen: a spinner while loading, the greeting as the heading, or an error with "Try again".
/// Platform default colours and Dynamic Type text styles; the token theme comes with #57.
struct HelloView: View {
    let model: HelloViewModel

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    .padding()
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height)
            }
        }
        .environment(\.locale, model.catalog.formattingLocale)
        .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .accessibilityLabel(model.catalog[.commonLoading])
                .accessibilityIdentifier("hello.loading")
        case let .loaded(greeting):
            Text(greeting)
                .font(.largeTitle.bold())
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("hello.greeting")
        case .failed:
            VStack(spacing: 24) {
                Text(model.catalog[.helloError])
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("hello.error")
                Button {
                    Task { await model.load() }
                } label: {
                    Text(model.catalog[.commonRetry])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("hello.retry")
            }
        }
    }
}
