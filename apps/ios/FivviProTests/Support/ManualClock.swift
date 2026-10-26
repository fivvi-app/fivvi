import Foundation

/// A `Clock` that only moves when a test calls `advance(by:)`, so a test of a timeout neither sleeps nor races a real
/// timer (TESTING.md §1.6). `sleep` suspends until the clock is advanced to its deadline, or its task is cancelled.
final class ManualClock: Clock, @unchecked Sendable {
    struct Instant: InstantProtocol {
        fileprivate var offset: Duration

        func advanced(by duration: Duration) -> Instant { Instant(offset: offset + duration) }
        func duration(to other: Instant) -> Duration { other.offset - offset }
        static func < (lhs: Instant, rhs: Instant) -> Bool { lhs.offset < rhs.offset }
    }

    private struct Sleeper {
        let deadline: Instant
        let continuation: CheckedContinuation<Void, any Error>
    }

    private let lock = NSLock()
    private var current = Instant(offset: .zero)
    private var sleepers: [UUID: Sleeper] = [:]
    private var cancelledBeforeSleeping: Set<UUID> = []
    private var watchers: [CheckedContinuation<Void, Never>] = []

    var now: Instant { lock.withLock { current } }
    var minimumResolution: Duration { .zero }

    /// How many `sleep` calls are waiting right now.
    var sleeping: Int { lock.withLock { sleepers.count } }

    func sleep(until deadline: Instant, tolerance: Duration? = nil) async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                let resume = lock.withLock { () -> (() -> Void)? in
                    if cancelledBeforeSleeping.remove(id) != nil {
                        return { continuation.resume(throwing: CancellationError()) }
                    }
                    if deadline <= current { return { continuation.resume() } }
                    sleepers[id] = Sleeper(deadline: deadline, continuation: continuation)
                    let waiting = watchers
                    watchers = []
                    return { waiting.forEach { $0.resume() } }
                }
                resume?()
            }
        } onCancel: {
            let sleeper = lock.withLock { () -> Sleeper? in
                guard let sleeper = sleepers.removeValue(forKey: id) else {
                    cancelledBeforeSleeping.insert(id)
                    return nil
                }
                return sleeper
            }
            sleeper?.continuation.resume(throwing: CancellationError())
        }
    }

    /// Moves the clock on and wakes every sleeper whose deadline has come.
    func advance(by duration: Duration) {
        let due = lock.withLock { () -> [Sleeper] in
            current = current.advanced(by: duration)
            let due = sleepers.filter { $0.value.deadline <= current }
            due.keys.forEach { sleepers.removeValue(forKey: $0) }
            return Array(due.values)
        }
        due.forEach { $0.continuation.resume() }
    }

    /// Returns once at least one `sleep` call is waiting.
    func untilSleeping() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let ready = lock.withLock { () -> Bool in
                if !sleepers.isEmpty { return true }
                watchers.append(continuation)
                return false
            }
            if ready { continuation.resume() }
        }
    }
}
