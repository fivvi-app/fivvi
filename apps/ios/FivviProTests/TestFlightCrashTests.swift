import XCTest

@testable import FivviPro

/// E017 #265: the hidden crash for the Sentry check (#192) fires in TestFlight builds only. The crash handler is
/// injected, so no test crashes the test host.
final class TestFlightCrashTests: XCTestCase {
    private let testFlightReceipt = URL(fileURLWithPath: "/private/var/mobile/StoreKit/sandboxReceipt")
    private let appStoreReceipt = URL(fileURLWithPath: "/private/var/mobile/StoreKit/receipt")

    func test_E017_AC2_sandboxReceiptIsTestFlight() {
        XCTAssertTrue(TestFlightCrash.isTestFlight(receiptURL: testFlightReceipt))
    }

    func test_E017_AC2_productionReceiptIsNotTestFlight() {
        XCTAssertFalse(TestFlightCrash.isTestFlight(receiptURL: appStoreReceipt))
    }

    func test_E017_AC2_noReceiptIsNotTestFlight() {
        XCTAssertFalse(TestFlightCrash.isTestFlight(receiptURL: nil))
    }

    func test_E017_AC5_testFlightReleaseBuildFiresTheCrashHandler() {
        var crashes = 0

        TestFlightCrash.trigger(receiptURL: testFlightReceipt, releaseBuild: true) { crashes += 1 }

        XCTAssertEqual(crashes, 1)
    }

    func test_E017_AC5_appStoreBuildNeverFiresTheCrashHandler() {
        var crashes = 0

        TestFlightCrash.trigger(receiptURL: appStoreReceipt, releaseBuild: true) { crashes += 1 }

        XCTAssertEqual(crashes, 0)
    }

    func test_E017_AC5_buildWithoutReceiptNeverFiresTheCrashHandler() {
        var crashes = 0

        TestFlightCrash.trigger(receiptURL: nil, releaseBuild: true) { crashes += 1 }

        XCTAssertEqual(crashes, 0)
    }

    /// Xcode installs a Debug build on a phone with a sandbox receipt too; a local build must never crash from it.
    func test_E017_AC2_debugBuildNeverFiresTheCrashHandlerEvenWithSandboxReceipt() {
        var crashes = 0

        TestFlightCrash.trigger(receiptURL: testFlightReceipt, releaseBuild: false) { crashes += 1 }

        XCTAssertEqual(crashes, 0)
        XCTAssertFalse(TestFlightCrash.isArmed(receiptURL: testFlightReceipt, releaseBuild: false))
    }

    func test_E017_AC2_thisTestBuildIsNotArmed() {
        XCTAssertFalse(TestFlightCrash.isArmed())
    }

    func test_E017_AC1_theGestureTakesSeveralSeconds() {
        XCTAssertGreaterThanOrEqual(TestFlightCrash.holdDuration, 3)
    }
}
