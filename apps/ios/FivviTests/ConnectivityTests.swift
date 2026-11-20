import FivviUI
import XCTest

@testable import Fivvi

/// Whether the phone is online, for the offline banner (E017 AC9). The system's network path can't be switched in a test;
/// the source is injected.
@MainActor
final class ConnectivityTests: XCTestCase {
    /// A source the test moves between online and offline.
    private final class MovableSource: ConnectivitySource, @unchecked Sendable {
        private let lock = NSLock()
        private var update: (@Sendable (Bool) -> Void)?

        func start(_ update: @escaping @Sendable (Bool) -> Void) { lock.withLock { self.update = update } }
        func stop() {}
        func move(to online: Bool) { lock.withLock { update }?(online) }
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    func test_E017_AC9_theAppIsOnlineUntilTheSystemSaysOtherwise() {
        XCTAssertTrue(Connectivity(source: MovableSource()).isOnline)
    }

    func test_E017_AC9_aLostConnectionShowsAndAComingBackHidesTheBanner() async {
        let source = MovableSource()
        let connectivity = Connectivity(source: source)
        connectivity.start()

        source.move(to: false)
        await settle()
        XCTAssertFalse(connectivity.isOnline)

        source.move(to: true)
        await settle()
        XCTAssertTrue(connectivity.isOnline)
    }

    func test_E017_AC9_aDebugLaunchArgumentFixesTheAnswerForUITests() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "ConnectivityTests"))
        defaults.removePersistentDomain(forName: "ConnectivityTests")
        defaults.set("offline", forKey: Connectivity.uiTestKey)
        let offline = Connectivity.forLaunch(defaults: defaults)
        offline.start()
        defaults.set("online", forKey: Connectivity.uiTestKey)
        let online = Connectivity.forLaunch(defaults: defaults)
        online.start()
        await settle()

        XCTAssertFalse(offline.isOnline)
        XCTAssertTrue(online.isOnline)
    }
}
