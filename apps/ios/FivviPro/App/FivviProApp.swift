import OpenAPIURLSession
import SwiftUI
import FivviAPI
import FivviDesignTokens

@main
struct FivviProApp: App {
    @State private var hello: HelloViewModel

    init() {
        ErrorReporting.start()
        let client = Client(serverURL: AppConfiguration.apiBaseURL(), transport: URLSessionTransport())
        let catalog = Catalog(locale: InterfaceLanguage.resolve(.forLaunch()))
        _hello = State(initialValue: HelloViewModel(api: client, catalog: catalog))
    }

    var body: some Scene {
        WindowGroup {
            HelloView(model: hello)
                .tint(Tokens.Colors.actionPrimaryBg)
                .preferredColorScheme(LaunchAppearance.colorScheme())
        }
    }
}
