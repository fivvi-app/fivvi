import XCTest

/// E017 #505: Fivvi declares the Associated Domains entitlement `applinks:fivvi.app`, so its links open it. The paths
/// (`/j/*` and `/i/*` only) are in the association file the web serves for `app.fivvi` (#502); the entitlement names the
/// domain. Fivvi Pro's own test checks that it declares none.
final class AssociatedDomainsTests: XCTestCase {
    func test_E017_AC6_fivviDeclaresTheAssociatedDomainOfItsLinksAndNothingElse() throws {
        let entitlements = try XCTUnwrap(try EmbeddedEntitlements.ofApp(), "the build carries entitlements")

        XCTAssertEqual(
            entitlements["com.apple.developer.associated-domains"] as? [String], ["applinks:fivvi.app"]
        )
    }
}
