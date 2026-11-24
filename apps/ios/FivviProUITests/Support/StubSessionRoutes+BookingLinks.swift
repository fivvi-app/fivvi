import Foundation

/// `POST …/booking-links` of the stub server (F037), over the class dates of `StubSessionRoutes`: get or make. The
/// first request for a class date makes its link (`201`), every later one gets the same link (`200`), whoever asks. A
/// date that is not a group class date answers `400` on `sessionId` as the API does. The short URL is
/// `https://fivvi.app/l/{code}` (synthetic code).
extension StubSessionRoutes {
    /// Every `POST …/booking-links` body so far, each value as text, with the answer's `status` and the link's `linkId`
    /// (empty when none was made).
    var bookingLinkRequests: [[String: String]] { lock.withLock { bookingLinkBodies } }

    func createBookingLink(_ body: [String: Any]) -> (Int, [String: Any]) {
        let answer = answerBookingLink(body)
        let result = ["status": "\(answer.0)", "linkId": answer.1["id"] as? String ?? ""]
        bookingLinkBodies.append(body.mapValues(Self.text).merging(result) { $1 })
        return answer
    }

    private func answerBookingLink(_ body: [String: Any]) -> (Int, [String: Any]) {
        let invalid: (Int, [String: Any]) = (
            400, ["code": "validation_failed", "issues": [["path": "sessionId", "code": "invalid"]]]
        )
        guard body["scope"] as? String == "session", let id = body["sessionId"] as? String else { return invalid }
        guard let date = find(id) else { return (404, ["code": "not_found"]) }
        guard date["type"] as? String == "group" else { return invalid }
        if let made = bookingLinks[id] { return (200, made) }
        let number = bookingLinks.count + 1
        let link: [String: Any] = [
            "id": String(format: "b10c1c2e-8a54-4b51-9a42-%012d", number),
            "url": "https://fivvi.app/l/code\(number)", "scope": "session",
            "language": body["language"] as? String ?? "visitor", "active": true, "deactivatedAt": NSNull(),
            "createdAt": Self.iso().string(from: Date()), "groupClass": NSNull(),
            "date": ["id": id, "startsAt": date["startsAt"] ?? "", "timeZone": Self.zone,
                     "groupClass": date["groupClass"] ?? NSNull()]
        ]
        bookingLinks[id] = link
        return (201, link)
    }
}
