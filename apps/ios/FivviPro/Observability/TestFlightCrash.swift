import SwiftUI

/// A deliberate crash that only a TestFlight build can trigger (E017, #265), so the owner can prove that symbolicated
/// frames reach Sentry (#192): a TestFlight build can't be crashed from outside, unlike Android's `adb shell am crash`.
/// A long press on the home greeting calls it. Nothing else shows it: no string, no control, no accessibility element.
/// App Store builds (production receipt) and Debug/simulator builds never arm it, and then the gesture isn't even
/// attached to the view.
enum TestFlightCrash {
    /// How long the greeting is held down; long enough that nobody triggers it by accident.
    static let holdDuration: TimeInterval = 5

    /// TestFlight builds carry a sandbox receipt; App Store builds have one named `receipt`.
    static func isTestFlight(receiptURL: URL?) -> Bool {
        receiptURL?.lastPathComponent == "sandboxReceipt"
    }

    /// Whether this build is a Release archive: a Debug build installed from Xcode has a sandbox receipt too.
    static var isReleaseBuild: Bool {
        #if DEBUG
        false
        #else
        true
        #endif
    }

    static func isArmed(
        receiptURL: URL? = Bundle.main.appStoreReceiptURL, releaseBuild: Bool = isReleaseBuild
    ) -> Bool {
        releaseBuild && isTestFlight(receiptURL: receiptURL)
    }

    /// Calls `crash` when this is a TestFlight build, and never otherwise.
    static func trigger(
        receiptURL: URL? = Bundle.main.appStoreReceiptURL,
        releaseBuild: Bool = isReleaseBuild,
        crash: () -> Void = ErrorReporting.crashForTesting
    ) {
        guard isArmed(receiptURL: receiptURL, releaseBuild: releaseBuild) else { return }
        crash()
    }
}

extension View {
    /// Crashes the app on purpose after a long press, in a TestFlight build only; any other build gets the view
    /// unchanged. A plain gesture adds no accessibility action or trait.
    @ViewBuilder func testFlightCrashTrigger() -> some View {
        if TestFlightCrash.isArmed() {
            gesture(
                LongPressGesture(minimumDuration: TestFlightCrash.holdDuration).onEnded { _ in
                    TestFlightCrash.trigger()
                }
            )
        } else {
            self
        }
    }
}
