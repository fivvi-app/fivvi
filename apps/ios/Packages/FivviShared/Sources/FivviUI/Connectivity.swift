import Foundation
import Network
import Observation

/// Where the app learns whether the phone is online: the system's network path in the app, a fixed answer in a UI test.
public protocol ConnectivitySource: Sendable {
    /// Calls `update` with whether the phone is online, now and at every change. May call it on any queue.
    func start(_ update: @escaping @Sendable (_ online: Bool) -> Void)
    func stop()
}

/// Whether the phone is online, for the offline banner (E017 AC9). It only says what the system's network path says:
/// the app queues nothing while offline, and a later feature decides what it sends.
@MainActor
@Observable
public final class Connectivity {
    /// Debug-only launch argument for UI tests: `-UITestConnectivity offline` or `online` fixes the answer, so a test
    /// doesn't depend on the network of the machine it runs on.
    public static let uiTestKey = "UITestConnectivity"

    /// True until the system says otherwise: a screen never opens with the banner on before it knows.
    public private(set) var isOnline = true
    private let source: any ConnectivitySource

    public init(source: any ConnectivitySource = NetworkPathSource()) {
        self.source = source
    }

    /// Starts listening. The model lives as long as the app, so nothing stops it.
    public func start() {
        source.start { [weak self] online in
            Task { @MainActor in self?.isOnline = online }
        }
    }

    /// The connectivity this launch of the app uses: the fixed answer of a UI test (Debug builds), else the system's.
    public static func forLaunch(defaults: UserDefaults = .standard) -> Connectivity {
        #if DEBUG
            switch defaults.string(forKey: uiTestKey) {
            case "offline": return Connectivity(source: FixedConnectivity(online: false))
            case "online": return Connectivity(source: FixedConnectivity(online: true))
            default: break
            }
        #endif
        return Connectivity()
    }
}

/// The system's network path: online while it is satisfied.
public final class NetworkPathSource: ConnectivitySource, @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "app.fivvi.connectivity")

    public init() {}

    public func start(_ update: @escaping @Sendable (Bool) -> Void) {
        monitor.pathUpdateHandler = { path in update(path.status == .satisfied) }
        monitor.start(queue: queue)
    }

    public func stop() {
        monitor.cancel()
    }
}

/// An answer that never changes: for UI tests and unit tests.
public struct FixedConnectivity: ConnectivitySource {
    public let online: Bool

    public init(online: Bool) {
        self.online = online
    }

    public func start(_ update: @escaping @Sendable (Bool) -> Void) {
        update(online)
    }

    public func stop() {}
}
