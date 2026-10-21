import Sentry
import XCTest

@testable import FivviPro

/// E009 AC8: the scrubber edits the SDK's event in place (OBSERVABILITY.md §1 "iOS"), so it must decide about every field.
final class ObservabilityFieldTests: XCTestCase {
    /// The scrubber edits the SDK's event in place, so it must decide about every field: a field that a new
    /// sentry-cocoa version adds fails this test until Scrubber.swift keeps or clears it (OBSERVABILITY.md §1 "iOS").
    func test_E009_AC8_scrubberDecidesEveryField() {
        let decisions: [FieldDecision] = [
            FieldDecision(
                Event.self,
                kept: [
                    "eventId", "timestamp", "startTimestamp", "level", "platform", "logger", "releaseName", "dist",
                    "environment", "transaction", "type", "sdk", "fingerprint", "debugMeta", "message", "exceptions",
                    "threads", "stacktrace", "request", "user", "tags", "context", "breadcrumbs",
                    "serializedBreadcrumbs",
                    // The SDK's own state, never sent.
                    "error", "isFatalEvent", "isAppHangEvent", "attachAllThreadsOverride", "startSystemTime",
                    "endSystemTime"
                ],
                cleared: ["serverName", "extra", "modules"]
            ),
            FieldDecision(
                Exception.self,
                kept: ["type", "value", "module", "threadId", "mechanism", "stacktrace"],
                cleared: []
            ),
            FieldDecision(
                Mechanism.self,
                kept: ["type", "handled", "synthetic", "helpLink", "meta"],
                cleared: ["desc", "data"]
            ),
            FieldDecision(
                SentryThread.self,
                kept: ["threadId", "name", "crashed", "current", "isMain", "stacktrace"],
                cleared: []
            ),
            FieldDecision(SentryStacktrace.self, kept: ["frames", "registers", "snapshot"], cleared: []),
            FieldDecision(
                Frame.self,
                kept: [
                    "symbolAddress", "fileName", "function", "module", "package", "imageAddress", "platform",
                    "instructionAddress", "lineNumber", "columnNumber", "contextLine", "parentIndex", "sampleCount",
                    "preContext", "postContext", "inApp", "stackStart"
                ],
                cleared: ["vars"]
            ),
            FieldDecision(
                Breadcrumb.self,
                kept: ["type", "category", "level", "timestamp", "data"],
                cleared: ["message", "origin"]
            )
        ]
        for decision in decisions {
            XCTAssertEqual(
                Self.fields(of: decision.type), decision.kept.union(decision.cleared), "\(decision.type)"
            )
        }
    }

    /// What the scrubber does with each field of an SDK type it edits in place.
    private struct FieldDecision {
        let type: AnyClass
        let kept: Set<String>
        let cleared: Set<String>

        init(_ type: AnyClass, kept: Set<String>, cleared: Set<String>) {
            self.type = type
            self.kept = kept
            self.cleared = cleared
        }
    }

    /// The Objective-C properties of an SDK type, without NSObject's.
    private static func fields(of type: AnyClass) -> Set<String> {
        var count: UInt32 = 0
        guard let list = class_copyPropertyList(type, &count) else { return [] }
        defer { free(list) }
        let names = (0..<Int(count)).map { String(cString: property_getName(list[$0])) }
        return Set(names).subtracting(["debugDescription", "description", "hash", "superclass"])
    }
}
