import SwiftUI
import UIKit

extension View {
    /// Gives the field of `.searchable` an accessibility identifier, which SwiftUI offers no way to set (the Maestro flow
    /// and the UI tests find it as `clients.search`, as on Android).
    func searchFieldIdentifier(_ id: String) -> some View {
        background(SearchFieldIdentifier(id: id))
    }
}

private struct SearchFieldIdentifier: UIViewControllerRepresentable {
    let id: String

    func makeUIViewController(context: Context) -> Marker { Marker(id: id) }
    func updateUIViewController(_ controller: Marker, context: Context) { controller.mark() }

    /// Finds the search bar that `.searchable` put on the navigation item of the screen it is in.
    final class Marker: UIViewController {
        private let id: String

        init(id: String) {
            self.id = id
            super.init(nibName: nil, bundle: nil)
        }

        @available(*, unavailable) required init?(coder: NSCoder) { nil }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            mark()
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            mark()
        }

        func mark() {
            let item = navigationController?.topViewController?.navigationItem
            item?.searchController?.searchBar.searchTextField.accessibilityIdentifier = id
        }
    }
}
