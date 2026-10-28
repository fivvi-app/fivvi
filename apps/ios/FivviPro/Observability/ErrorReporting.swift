import Foundation
import Sentry

/// Error reporting to Sentry (E009, ADR-013, docs/engineering/OBSERVABILITY.md §1 "iOS"). The only code in the app that
/// talks to sentry-cocoa: SwiftLint's `no_direct_sentry` rule fails anywhere else.
enum ErrorReporting {
    /// Info.plist key of the Sentry DSN (`FIVVI_SENTRY_DSN` in Config/*.xcconfig). Empty turns reporting off.
    static let dsnKey = "FivviSentryDSN"
    /// Info.plist key of the Sentry environment (`FIVVI_SENTRY_ENVIRONMENT`): `development` or `production`.
    static let environmentKey = "FivviSentryEnvironment"

    /// What a build configuration sets for error reporting; `nil` without a DSN, which turns reporting off.
    struct Configuration: Equatable {
        let dsn: String
        let environment: String
        /// `<bundle ID>@<version>+<build>`, Sentry's own format for app releases.
        let release: String

        init?(info: [String: Any]?) {
            let dsn = (info?[ErrorReporting.dsnKey] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            guard !dsn.isEmpty, let info else { return nil }
            guard let environment = info[ErrorReporting.environmentKey] as? String, !environment.isEmpty,
                  let bundleID = info["CFBundleIdentifier"] as? String,
                  let version = info["CFBundleShortVersionString"] as? String,
                  let build = info["CFBundleVersion"] as? String
            else {
                preconditionFailure("\(ErrorReporting.environmentKey) or the bundle version is missing in Info.plist")
            }
            self.dsn = dsn
            self.environment = environment
            release = "\(bundleID)@\(version)+\(build)"
        }
    }

    /// Starts reporting crashes and errors when the build configuration has a DSN; otherwise does nothing, so the SDK
    /// makes no network call. Returns whether it started.
    @discardableResult
    static func start(info: [String: Any]? = Bundle.main.infoDictionary) -> Bool {
        guard let configuration = Configuration(info: info) else { return false }
        SentrySDK.start(options: options(for: configuration))
        return true
    }

    /// Reports an error the app handled but that shouldn't happen; does nothing while reporting is off. Like every
    /// event it passes the scrubber, which keeps the error's description with email addresses masked: put IDs in
    /// errors, never names or note content (ADR-013).
    static func capture(_ error: Error) {
        guard SentrySDK.isEnabled else { return }
        SentrySDK.capture(error: error)
    }

    /// Sets the signed-in account's ID (the UUID `GET /api/v1/me` answers with) as the user of later events and
    /// sessions. Never an email address or a name; the scrubber drops anything but a UUID. Does nothing while
    /// reporting is off.
    static func setUser(_ accountId: String) {
        guard SentrySDK.isEnabled else { return }
        SentrySDK.setUser(User(userId: accountId))
    }

    /// Signed out: later events carry the install's ID again (the SDK sets it when no user is set), not the previous
    /// account's. Does nothing while reporting is off.
    static func clearUser() {
        guard SentrySDK.isEnabled else { return }
        SentrySDK.setUser(nil)
    }

    /// Crashes the app on purpose with the SDK's own test crash, which it reports at the next start. Only
    /// `TestFlightCrash` calls it, and only in a TestFlight build.
    static func crashForTesting() {
        SentrySDK.crash()
    }

    /// Crashes, errors and release health (crash-free sessions) only: no tracing, profiling, session replay,
    /// screenshots, logs or captured HTTP failures, and every event and breadcrumb passes the scrubber.
    static func options(for configuration: Configuration) -> Options {
        let options = Options()
        options.dsn = configuration.dsn
        options.environment = configuration.environment
        options.releaseName = configuration.release
        options.enableCrashHandler = true
        options.enableAutoSessionTracking = true
        options.sendDefaultPii = false
        options.beforeSend = beforeSend
        options.beforeBreadcrumb = beforeBreadcrumb
        options.tracesSampleRate = nil
        options.enableAutoPerformanceTracing = false
        options.sessionReplay.sessionSampleRate = 0
        options.sessionReplay.onErrorSampleRate = 0
        options.attachScreenshot = false
        options.attachViewHierarchy = false
        options.enableCaptureFailedRequests = false
        options.enableLogs = false
        options.sendClientReports = false
        return options
    }

    /// Every event passes the scrubber (OBSERVABILITY.md §2) before it leaves the app.
    static func beforeSend(_ event: Event) -> Event? {
        Scrubber.scrub(event)
    }

    /// Every breadcrumb passes the scrubber when it is recorded, so a crash report never stores one unscrubbed.
    static func beforeBreadcrumb(_ breadcrumb: Breadcrumb) -> Breadcrumb? {
        Scrubber.scrub(breadcrumb)
    }
}
