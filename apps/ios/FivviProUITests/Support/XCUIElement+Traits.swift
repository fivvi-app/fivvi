import UIKit
import XCTest

extension XCUIElement {
    /// Whether the element has an accessibility trait, e.g. `.header` (what VoiceOver reads as "heading").
    /// XCTest has no public API for traits; its element snapshots carry them as `traits`, read here by key. The
    /// lookup fails the test rather than passing when a future XCTest drops it.
    func hasTrait(_ trait: UIAccessibilityTraits) throws -> Bool {
        let snapshot = try snapshot() as AnyObject
        let traits = try XCTUnwrap(snapshot.value(forKey: "traits") as? UInt64, "XCTest no longer exposes traits")
        return traits & trait.rawValue != 0
    }
}
