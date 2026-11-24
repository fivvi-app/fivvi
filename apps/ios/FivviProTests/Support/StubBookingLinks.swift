import Foundation
import FivviAPI

/// `POST …/booking-links` of the stub workspace (F037): get-or-create. The first request for a scope, target and
/// language makes the link (`201`); every later one gets the same link (`200`), whoever asks. A link's short URL is
/// `https://fivvi.app/l/{code}`, the code made from the number of the link (synthetic).
final class StubBookingLinks: @unchecked Sendable {
    typealias Link = Components.Schemas.BookingLink

    private let lock = NSLock()
    private var failure: StubSessions.Failure?
    private var made: [Link] = []
    /// The scope, language and class date each link was made for.
    private var targets: [String] = []
    private var sent: [Components.Schemas.CreateBookingLinkRequest] = []

    /// Every `POST …/booking-links` body so far.
    var requests: [Components.Schemas.CreateBookingLinkRequest] { lock.withLock { sent } }
    /// The links made so far.
    var links: [Link] { lock.withLock { made } }

    /// What the route answers instead of working; nil makes it work again.
    func fail(with failure: StubSessions.Failure?) {
        lock.withLock { self.failure = failure }
    }

    func create(_ body: Components.Schemas.CreateBookingLinkRequest) throws -> Operations.CreateBookingLink.Output {
        try lock.withLock {
            sent.append(body)
            if let failure {
                switch failure {
                case .offline: throw URLError(.notConnectedToInternet)
                case .forbidden: return .forbidden(.init(body: .json(.init(code: .forbidden))))
                case let .badRequest(path, code):
                    return .badRequest(.init(body: .json(.init(
                        code: .validationFailed, issues: [.init(path: path, code: code)]
                    ))))
                default: return .undocumented(statusCode: 500, .init())
                }
            }
            let target = "\(body.scope.rawValue)/\(body.language.rawValue)/\(body.sessionId ?? "")"
            if let index = targets.firstIndex(of: target) { return .ok(.init(body: .json(made[index]))) }
            let number = made.count + 1
            let link = Link(
                id: String(format: "b10c1c2e-8a54-4b51-9a42-%012d", number),
                url: "https://fivvi.app/l/code\(number)", scope: .init(rawValue: body.scope.rawValue) ?? .session,
                language: .init(rawValue: body.language.rawValue) ?? .visitor, active: true, deactivatedAt: nil,
                createdAt: Date(), groupClass: nil, date: nil
            )
            made.append(link)
            targets.append(target)
            return .created(.init(body: .json(link)))
        }
    }
}
