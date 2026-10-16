import XCTest

extension XCTestCase {
    /// A fresh, empty `UserDefaults` suite, removed after the test.
    func emptyDefaults() throws -> UserDefaults {
        let suite = "nl.trainerhub.app.tests.\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        return try XCTUnwrap(UserDefaults(suiteName: suite))
    }
}
