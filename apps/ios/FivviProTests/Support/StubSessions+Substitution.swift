import Foundation
import FivviAPI

extension StubSessions {
    /// The date is a substitution (F024): its trainer replaces `original`, as `GET …/sessions/{id}` says.
    func substitute(_ id: String, for original: Components.Schemas.SubstituteFor) {
        lock.withLock {
            guard let index = stored.firstIndex(where: { $0.id == id }) else { return }
            stored[index].substituteFor = try? .init(value1: original, value2: .init(unvalidatedValue: nil))
        }
    }
}
