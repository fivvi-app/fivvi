// E009 (#48): SwiftLint must reject every line marked `expect: no_direct_sentry`, and nothing else.
// scripts/test-ios.sh lints this file and compares the reported lines with the markers. It is not part of any target.
import Sentry // expect: no_direct_sentry
import SentrySwiftUI // expect: no_direct_sentry
import struct Sentry.SentryId // expect: no_direct_sentry

enum DirectSentry {
    static func report(_ error: Error) {
        SentrySDK.capture(error: error) // expect: no_direct_sentry
    }

    // SentrySDK in a comment is fine, and so is the app's own module.
    static let reason = "SentrySDK is only called from TrainerHub/Observability/"
    static func start() {
        ErrorReporting.start()
    }
}
