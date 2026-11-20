import Foundation

/// The entitlements a simulator build carries (the property list with the Keychain access group both apps have, and
/// the Associated Domains of Fivvi): Xcode signs it ad hoc and embeds them as a property list in the executable
/// (`__TEXT,__entitlements`), which is where the system reads them on a simulator. A device build takes them from the
/// signature, so this proves the Debug build the tests run on, from the same `CODE_SIGN_ENTITLEMENTS` setting. One
/// file for both apps: `Fivvi.xcodeproj` reads it from here for `FivviTests`.
enum EmbeddedEntitlements {
    /// The embedded entitlements of the app under test, or nil when it carries none.
    static func ofApp(executable: URL? = Bundle.main.executableURL) throws -> [String: Any]? {
        guard let executable else { return nil }
        let data = try Data(contentsOf: executable, options: .mappedIfSafe)
        let start = Data("<?xml".utf8)
        let end = Data("</plist>".utf8)
        var from = data.startIndex
        while let open = data.range(of: start, in: from..<data.endIndex),
              let close = data.range(of: end, in: open.lowerBound..<data.endIndex) {
            let plist = data[open.lowerBound..<close.upperBound]
            if let entitlements = (try? PropertyListSerialization.propertyList(from: plist, format: nil))
                as? [String: Any], entitlements["keychain-access-groups"] != nil {
                return entitlements
            }
            from = close.upperBound
        }
        return nil
    }
}
