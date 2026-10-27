import XCTest

@testable import FivviPro

/// E017 #265, serving E017's AC6 (a crash from a TestFlight build shows a symbolicated stack in Sentry): the hidden
/// crash for the Sentry check (#192) fires in TestFlight builds only. The crash handler is injected, so no test
/// crashes the test host.
final class TestFlightCrashTests: XCTestCase {
    private let testFlightReceipt = URL(fileURLWithPath: "/private/var/mobile/StoreKit/sandboxReceipt")
    private let appStoreReceipt = URL(fileURLWithPath: "/private/var/mobile/StoreKit/receipt")

    /// How often the crash handler ran for a build; the defaults describe a TestFlight build on a phone.
    private func crashes(
        receiptURL: URL?? = nil, releaseBuild: Bool = true, simulator: Bool = false, provisioningProfile: Bool = false
    ) -> Int {
        var crashes = 0
        TestFlightCrash.trigger(
            receiptURL: receiptURL ?? testFlightReceipt, releaseBuild: releaseBuild, simulator: simulator,
            provisioningProfile: provisioningProfile
        ) { crashes += 1 }
        return crashes
    }

    func test_E017_AC6_sandboxReceiptIsTestFlight() {
        XCTAssertTrue(TestFlightCrash.isTestFlight(receiptURL: testFlightReceipt))
    }

    func test_E017_AC6_productionReceiptIsNotTestFlight() {
        XCTAssertFalse(TestFlightCrash.isTestFlight(receiptURL: appStoreReceipt))
    }

    func test_E017_AC6_noReceiptIsNotTestFlight() {
        XCTAssertFalse(TestFlightCrash.isTestFlight(receiptURL: nil))
    }

    func test_E017_AC6_testFlightReleaseBuildFiresTheCrashHandler() {
        XCTAssertEqual(crashes(), 1)
    }

    func test_E017_AC6_appStoreBuildNeverFiresTheCrashHandler() {
        XCTAssertEqual(crashes(receiptURL: .some(appStoreReceipt)), 0)
    }

    func test_E017_AC6_buildWithoutReceiptNeverFiresTheCrashHandler() {
        XCTAssertEqual(crashes(receiptURL: .some(nil)), 0)
    }

    /// Xcode installs a Debug build on a phone with a sandbox receipt too; a local build must never crash from it.
    func test_E017_AC6_debugBuildNeverFiresTheCrashHandlerEvenWithSandboxReceipt() {
        XCTAssertEqual(crashes(releaseBuild: false), 0)
    }

    /// A Release configuration run on a simulator (Profile action, `xcodebuild -configuration Release`) has a sandbox
    /// receipt as well.
    func test_E017_AC6_simulatorNeverFiresTheCrashHandlerEvenInReleaseWithSandboxReceipt() {
        XCTAssertEqual(crashes(simulator: true), 0)
    }

    /// Xcode and ad hoc builds always embed a provisioning profile; TestFlight and App Store builds have none.
    func test_E017_AC6_buildWithProvisioningProfileNeverFiresTheCrashHandler() {
        XCTAssertEqual(crashes(provisioningProfile: true), 0)
    }

    func test_E017_AC6_onlyTheTestFlightCombinationIsArmed() {
        XCTAssertTrue(
            TestFlightCrash.isArmed(
                receiptURL: testFlightReceipt, releaseBuild: true, simulator: false, provisioningProfile: false))
    }

    func test_E017_AC6_thisTestBuildIsNotArmed() {
        XCTAssertFalse(TestFlightCrash.isArmed())
    }

    func test_E017_AC6_theGestureTakesSeveralSeconds() {
        XCTAssertGreaterThanOrEqual(TestFlightCrash.holdDuration, 3)
    }
}
