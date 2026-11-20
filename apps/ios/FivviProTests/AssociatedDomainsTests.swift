import XCTest

/// E017 #505: Fivvi Pro claims no links. Its entitlements have no Associated Domains, so no `fivvi.app` link opens it
/// (the client app Fivvi owns `/j/*` and `/i/*`).
final class AssociatedDomainsTests: XCTestCase {
    func test_E017_AC6_fivviProDeclaresNoAssociatedDomain() throws {
        let entitlements = try XCTUnwrap(try EmbeddedEntitlements.ofApp(), "the build carries entitlements")

        XCTAssertNil(entitlements["com.apple.developer.associated-domains"])
        XCTAssertEqual(entitlements["keychain-access-groups"] as? [String], ["app.fivvi.pro"], "it is Fivvi Pro's")
    }
}
