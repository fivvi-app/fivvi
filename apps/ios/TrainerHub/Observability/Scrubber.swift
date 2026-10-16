import Foundation
import Sentry

/// The scrubber (ADR-013, docs/engineering/OBSERVABILITY.md §2), the same allowlist as `scrubEvent` and
/// `scrubBreadcrumb` in packages/observability/src/scrub.ts, applied to every event and breadcrumb in `beforeSend` and
/// `beforeBreadcrumb` before anything leaves the app. Three native differences (OBSERVABILITY.md §1 "iOS"): threads stay, because a crash's
/// stack trace is in its threads; `server_name` goes, because on a phone it would be the device name; and a
/// mechanism's description goes, because for an NSError it holds the whole `userInfo`.
///
/// Request, user and message are rebuilt from the kept fields. The event, its exceptions, threads and breadcrumbs are
/// edited in place, because they carry state the SDK still needs (e.g. whether the event is a crash): every other
/// field is either kept or cleared here. `test_E009_AC8_scrubberDecidesEveryField` lists those decisions and fails
/// when a new sentry-cocoa version adds a field, so a new field never leaves the app unreviewed.
enum Scrubber {
    /// Request headers worth keeping for debugging. Never cookies, auth or forwarding (IP) headers.
    private static let requestHeaders: Set = ["accept", "accept-language", "content-length", "content-type"]
    /// Tags we set ourselves. Values are route templates, never real paths.
    private static let tags: Set = ["route"]
    /// Contexts the SDK fills with facts about the runtime, never about people.
    private static let contexts: Set = ["app", "cloud_resource", "culture", "device", "os", "runtime", "trace"]
    /// Breadcrumb data of HTTP requests; the URL loses its query string.
    private static let breadcrumbData: Set = ["method", "status_code", "url"]
    /// The user context keeps the internal user UUID and this, the workspace UUID.
    private static let workspaceKey = "organization_id"
    /// Breadcrumb fields other than `data`; the message and origin go.
    private static let breadcrumbFields: Set = ["type", "category", "level", "timestamp"]
    /// The private field in which a watchdog-termination event carries the previous run's breadcrumbs, serialized.
    private static let storedBreadcrumbsKey = "serializedBreadcrumbs"
    /// An email address, also URL-encoded (`%40`) in a path; scrub.ts's pattern.
    private static let email = #"[^\s@/?#&=:;,<>()"'\[\]]+(?:@|%40)[^\s@/?#&=:;,<>()"'\[\]]+\.[a-z]{2,}"#

    static func scrub(_ event: Event) -> Event {
        // The error's own message stays (emails masked): our errors never contain personal data or note content
        // (ADR-013), and without it an error can't be debugged.
        if let message = event.message {
            let scrubbed = SentryMessage(formatted: maskEmails(message.formatted))
            scrubbed.message = message.message.map(maskEmails)
            event.message = scrubbed
        }
        event.exceptions?.forEach(scrub)
        for stacktrace in (event.threads ?? []).compactMap(\.stacktrace) + [event.stacktrace].compactMap(\.self) {
            scrub(stacktrace)
        }
        event.request = event.request.flatMap(scrub)
        event.user = event.user.flatMap(scrub)
        event.tags = event.tags?.filter { tags.contains($0.key) }
        event.context = event.context.map(scrubContexts)
        event.breadcrumbs = event.breadcrumbs?.map(scrub)
        // Stored after `beforeBreadcrumb`, so already scrubbed; scrubbed again in case a breadcrumb got there another way.
        if event.responds(to: NSSelectorFromString(storedBreadcrumbsKey)),
           let stored = event.value(forKey: storedBreadcrumbsKey) as? [[String: Any]] {
            event.setValue(stored.map(scrubStored), forKey: storedBreadcrumbsKey)
        }
        event.serverName = nil
        event.extra = nil
        event.modules = nil
        return event
    }

    /// Breadcrumb messages are dropped: they are log lines from anywhere, including libraries, and may hold any text.
    /// Only the HTTP method, status code and URL path survive in `data`.
    static func scrub(_ breadcrumb: Breadcrumb) -> Breadcrumb {
        breadcrumb.message = nil
        breadcrumb.origin = nil
        let kept = scrubBreadcrumbData(breadcrumb.data ?? [:])
        for key in breadcrumb.data?.keys.map(\.self) ?? [] {
            breadcrumb.setData(value: kept[key], key: key)
        }
        return breadcrumb
    }

    /// A breadcrumb as the SDK stores it on disk, with the same rules.
    private static func scrubStored(_ breadcrumb: [String: Any]) -> [String: Any] {
        var kept = breadcrumb.filter { breadcrumbFields.contains($0.key) }
        let data = scrubBreadcrumbData(breadcrumb["data"] as? [String: Any] ?? [:])
        if !data.isEmpty {
            kept["data"] = data
        }
        return kept
    }

    private static func scrubBreadcrumbData(_ data: [String: Any]) -> [String: Any] {
        var kept = data.filter { breadcrumbData.contains($0.key) }
        if let url = kept["url"] as? String {
            kept["url"] = scrubURL(url)
        }
        return kept
    }

    private static func scrub(_ exception: Exception) {
        exception.value = exception.value.map(maskEmails)
        if let mechanism = exception.mechanism {
            // `data` and `desc` hold free text from the SDK (for an NSError its whole `userInfo`, query strings
            // included); the rest says how the error was caught.
            mechanism.data = nil
            mechanism.desc = nil
        }
        if let stacktrace = exception.stacktrace {
            scrub(stacktrace)
        }
    }

    /// Local variables (`vars`) may hold anything the code was working on.
    private static func scrub(_ stacktrace: SentryStacktrace) {
        stacktrace.frames.forEach { $0.vars = nil }
    }

    private static func scrub(_ request: SentryRequest) -> SentryRequest? {
        let scrubbed = SentryRequest()
        scrubbed.method = request.method
        scrubbed.url = request.url.map(scrubURL)
        let headers = Dictionary(
            request.headers?.map { ($0.key.lowercased(), $0.value) } ?? [], uniquingKeysWith: { first, _ in first }
        ).filter { requestHeaders.contains($0.key) }
        scrubbed.headers = headers.isEmpty ? nil : headers
        return scrubbed.method == nil && scrubbed.url == nil && scrubbed.headers == nil ? nil : scrubbed
    }

    /// Only the internal user UUID and the workspace UUID (`organization_id` in code).
    private static func scrub(_ user: User) -> User? {
        let scrubbed = User()
        scrubbed.userId = user.userId.flatMap(uuid)
        if let workspace = (user.data?[workspaceKey] as? String).flatMap(uuid) {
            scrubbed.data = [workspaceKey: workspace]
        }
        return scrubbed.userId == nil && scrubbed.data == nil ? nil : scrubbed
    }

    private static func scrubContexts(_ all: [String: [String: Any]]) -> [String: [String: Any]] {
        var kept = all.filter { contexts.contains($0.key) }
        if let status = all["response"]?["status_code"] {
            kept["response"] = ["status_code": status]
        }
        return kept
    }

    /// Drops the query string and fragment, and masks emails in the path.
    private static func scrubURL(_ url: String) -> String {
        maskEmails(String(url.prefix { $0 != "?" && $0 != "#" }))
    }

    /// Replaces every email address in `text`; the rest of the message stays readable.
    private static func maskEmails(_ text: String) -> String {
        text.replacingOccurrences(of: email, with: "[email]", options: [.regularExpression, .caseInsensitive])
    }

    private static func uuid(_ value: String) -> String? {
        UUID(uuidString: value) == nil ? nil : value
    }
}
