import Foundation
import OpenAPIRuntime

/// What went wrong with a request about clients, as far as the screens tell the cases apart (F006).
enum ClientRequestError: Error, Equatable {
    /// The API answered `403` or `404`: the person has no access to the clients of the workspace (any more).
    case noPermission
    /// The API couldn't be reached.
    case offline
    /// The screen that asked is gone, or asked again: the answer is of no interest.
    case cancelled
    /// Any other answer.
    case failed

    /// The case for an error the generated client threw: a transport error comes wrapped in a `ClientError`.
    init(thrown error: any Error) {
        let cause = (error as? ClientError)?.underlyingError ?? error
        if cause is CancellationError || (cause as? URLError)?.code == .cancelled {
            self = .cancelled
        } else if cause is URLError {
            self = .offline
        } else {
            self = .failed
        }
    }
}
