import OpenAPIURLSession
import SwiftUI
import TrainerHubAPI

@main
struct TrainerHubApp: App {
    @State private var hello: HelloViewModel

    init() {
        let client = Client(serverURL: AppConfiguration.apiBaseURL(), transport: URLSessionTransport())
        let catalog = Catalog(locale: InterfaceLanguage.resolve(.forLaunch()))
        _hello = State(initialValue: HelloViewModel(api: client, catalog: catalog))
    }

    var body: some Scene {
        WindowGroup {
            HelloView(model: hello)
        }
    }
}
