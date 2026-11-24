import Foundation
import FivviAPI
import FivviStrings

/// TD-03 *Boekingslink delen* (F037 AC8, AC9; Android twin: #978): the button below the booked card and the first item
/// of the Owner's ⋯ menu. A tap gets or makes the link of this class date in the visitor's language
/// (`POST …/booking-links`, `booking_link.copy`: the same link every time, for everyone on the team), puts its short
/// URL on the clipboard and says "Boekingslink gekopieerd". Not on a cancelled or past date and never on a private
/// session; offline the action is unavailable and nothing is queued.
extension ClassDateViewModel {
    /// Where *Boekingslink delen* is: nothing asked yet, a request on its way, the link copied, or why it wasn't.
    enum ShareState: Equatable {
        case idle
        case sharing
        case copied
        case failed(ShareFailure)
    }

    /// What a share that didn't happen says (offline has its own text, `shareLinkOfflineText`).
    enum ShareFailure: Equatable {
        case noPermission
        case notShared
    }

    /// The person may share this date's link: a group class date still to come, not cancelled (the API refuses a date
    /// that has started, and a private session).
    var showsShareLink: Bool {
        guard canShareLink, let session else { return false }
        return session._type == .group && session.status == .scheduled && session.startsAt > now()
    }

    /// The first item of the Owner's ⋯ menu.
    var showsShareLinkInMenu: Bool { showsShareLink && hasMenu }

    /// *Boekingslink delen* is on while the phone is online and no request is on its way (nothing is queued).
    var canTapShareLink: Bool { showsShareLink && !isOffline && shareState != .sharing }

    var shareLinkText: String { catalog[.classShareLink] }

    /// "Boekingslink gekopieerd", until the next tap.
    var shareLinkCopiedText: String? { shareState == .copied ? catalog[.classShareLinkCopied] : nil }

    /// *Je bent offline. Delen kan als je weer verbinding hebt.*, where *Boekingslink delen* is off for lack of a connection.
    var shareLinkOfflineText: String? { isOffline && showsShareLink ? catalog[.classShareLinkOffline] : nil }

    var shareLinkFailureText: String? {
        guard case let .failed(failure) = shareState else { return nil }
        switch failure {
        case .noPermission: return catalog[.bookingLinkErrorNoPermission]
        case .notShared: return catalog[.bookingLinkErrorGeneric]
        }
    }

    /// *Boekingslink delen*: gets or makes the link and copies its short URL.
    func shareLink() async {
        guard canTapShareLink else { return }
        shareState = .sharing
        let body = Components.Schemas.CreateBookingLinkRequest(
            scope: .session, language: .visitor, sessionId: sessionID, surface: .ios
        )
        do {
            let input = Operations.CreateBookingLink.Input(path: .init(workspaceId: workspace.id), body: .json(body))
            switch try await api.createBookingLink(input) {
            case let .ok(found):
                finishShare(try found.body.json)
            case let .created(made):
                finishShare(try made.body.json)
            case .forbidden:
                shareState = .failed(.noPermission)
                await onForbidden(.bookingLink_copy)
            default:
                shareState = .failed(.notShared)
            }
        } catch {
            switch ClientRequestError(thrown: error) {
            case .offline:
                requestFailedOffline = true
                shareState = .idle
            case .cancelled:
                shareState = .idle
            default:
                shareState = .failed(.notShared)
            }
        }
    }

    private func finishShare(_ link: Components.Schemas.BookingLink) {
        requestFailedOffline = false
        copy(link.url)
        shareState = .copied
    }
}
