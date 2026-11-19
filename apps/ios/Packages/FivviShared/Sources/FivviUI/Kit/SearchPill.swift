import SwiftUI
import UIKit

public enum SearchPillMetrics {
    /// The least a search field is high: a 44 pt touch target (the prototype's `.search` is 40 pt).
    public static let minHeight: CGFloat = 44
    /// The least the text shrinks to when it doesn't fit the field's width.
    public static let smallestFontSize: CGFloat = 12
}

/// The search field of a list (E020, the prototype's `.search`): a pill with a magnifier, the placeholder and, once
/// something is typed, a clear button. It is the system's search text field (`UISearchTextField`), so the clear button,
/// its name in the person's language and the search key come from iOS, and it is a search field to VoiceOver, UI tests
/// and Maestro (`identifier`). It sits in the content under the large title, not in the navigation bar, as the
/// prototype has it. `prompt` is its placeholder, also its accessible name. The text and the placeholder are the
/// system's colours; the cursor takes the tint of the view (`.tint`).
public struct SearchPill: UIViewRepresentable {
    public init(text: Binding<String>, prompt: String, identifier: String) {
        _text = text
        self.prompt = prompt
        self.identifier = identifier
    }
    @Binding public var text: String
    public let prompt: String
    public let identifier: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// What the field shows while it is empty: at the accessibility text sizes the placeholder would be cut off in a
    /// field one line high, so the magnifier alone shows (the name stays in `accessibilityLabel`).
    private var placeholder: String? { dynamicTypeSize.isAccessibilitySize ? nil : prompt }

    public func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    public func makeUIView(context: Context) -> UISearchTextField {
        let field = UISearchTextField()
        field.placeholder = placeholder
        field.accessibilityIdentifier = identifier
        field.accessibilityLabel = prompt
        field.accessibilityTraits.insert(.searchField)
        field.returnKeyType = .search
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.clearButtonMode = .whileEditing
        // One line in a field of the screen's width: the text scales with the setting, and shrinks to fit when the
        // placeholder or what is typed is still too long.
        field.font = .preferredFont(forTextStyle: .body)
        field.adjustsFontForContentSizeCategory = true
        field.adjustsFontSizeToFitWidth = true
        field.minimumFontSize = SearchPillMetrics.smallestFontSize
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
        field.delegate = context.coordinator
        return field
    }

    public func updateUIView(_ field: UISearchTextField, context: Context) {
        if field.text != text { field.text = text }
        field.placeholder = placeholder
        field.accessibilityLabel = prompt
    }

    public func sizeThatFits(
        _ proposal: ProposedViewSize, uiView field: UISearchTextField, context: Context
    ) -> CGSize? {
        let width = proposal.width ?? field.intrinsicContentSize.width
        let height = max(field.intrinsicContentSize.height, SearchPillMetrics.minHeight)
        return CGSize(width: width, height: height)
    }

    public final class Coordinator: NSObject, UITextFieldDelegate {
        init(text: Binding<String>) { self.text = text }
        let text: Binding<String>

        @objc func changed(_ field: UITextField) { text.wrappedValue = field.text ?? "" }

        public func textFieldShouldReturn(_ field: UITextField) -> Bool {
            field.resignFirstResponder()
            return true
        }

        public func textFieldShouldClear(_ field: UITextField) -> Bool {
            text.wrappedValue = ""
            return true
        }
    }
}
