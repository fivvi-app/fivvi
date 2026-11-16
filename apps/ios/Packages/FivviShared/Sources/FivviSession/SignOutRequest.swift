import Foundation
import FivviAPI

/// The request that ends this phone's sign-in session on the server (F001 AC10), for an app that signs out as Fivvi does.
///
/// The token is deleted before this runs, so a phone that is switched off or an app that is killed meanwhile opens signed
/// out; the request goes out with a snapshot of it (`AuthMiddleware.requestToken`). The wait for the API is a race
/// against a timer on an injected `Clock`, so a connection that hangs is not waited for longer than `timeout`: the request
/// goes on in the background. Only a `401` that arrives within the wait counts as a refused token.
public enum SignOutRequest {
    /// How long a sign-out waits for the API before it goes on without an answer.
    public static let defaultTimeout = Duration.seconds(10)

    /// Whether the API refused `token`, or false when it said anything else, did not answer or the wait ran out.
    public static func send(
        with token: String,
        api: any APIProtocol,
        clock: any Clock<Duration> = ContinuousClock(),
        timeout: Duration = defaultTimeout
    ) async -> Bool {
        await withCheckedContinuation { continuation in
            let race = Race(continuation)
            // Neither task is a child of the other: the first to finish ends the wait. An answer cancels the timer;
            // a timer that wins leaves the request running.
            Task {
                let output = await AuthMiddleware.$requestToken.withValue(token) { try? await api.signOut() }
                if case .unauthorized = output { race.finish(true) } else { race.finish(false) }
            }
            race.setTimer(Task {
                guard (try? await clock.sleep(for: timeout)) != nil else { return }
                race.finish(false)
            })
        }
    }
}

/// Resumes its continuation with the first answer only and cancels the timer; the request, if it lost, goes on.
private final class Race: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Bool, Never>?
    private var timer: Task<Void, Never>?

    init(_ continuation: CheckedContinuation<Bool, Never>) {
        self.continuation = continuation
    }

    func finish(_ rejected: Bool) {
        let (continuation, timer) = lock.withLock {
            defer { self.continuation = nil }
            return (self.continuation, self.timer)
        }
        timer?.cancel()
        continuation?.resume(returning: rejected)
    }

    /// Hands over the timer; if the race is already over it is cancelled at once.
    func setTimer(_ timer: Task<Void, Never>) {
        let over = lock.withLock {
            self.timer = timer
            return continuation == nil
        }
        if over { timer.cancel() }
    }
}
