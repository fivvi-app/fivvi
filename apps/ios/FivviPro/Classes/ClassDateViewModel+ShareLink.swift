import Foundation
import FivviAPI
import FivviStrings
import FivviUI

/// TD-03 *Boekingslink delen* (F037 AC8, AC9; Android twin: #978): the button below the booked card and the first item
/// of the Owner's ⋯ menu. A tap gets or makes the link of this class date, puts its short URL on the clipboard and says
/// "Boekingslink gekopieerd" in a toast (`BookingLinkShare`). Not on a cancelled or past date and never on a private
/// session; offline the action is unavailable and nothing is queued.
extension ClassDateViewModel {
    /// The person may share this date's link: a group class date still to come, not cancelled (the API refuses a date
    /// that has started, and a private session).
    var showsShareLink: Bool {
        guard canShareLink, let session else { return false }
        return session._type == .group && session.status == .scheduled && session.startsAt > now()
    }

    /// The first item of the Owner's ⋯ menu.
    var showsShareLinkInMenu: Bool { showsShareLink && hasMenu }

    /// *Boekingslink delen* is on while the phone is online and no request is on its way (nothing is queued).
    var canTapShareLink: Bool { showsShareLink && !isOffline && !share.isSharing }

    var shareLinkText: String { catalog[.classShareLink] }

    /// "Boekingslink gekopieerd", as a toast the screen shows for a moment.
    var shareToast: ToastMessage? { share.toast }

    func dismissShareToast() { share.dismissToast() }

    /// *Je bent offline. Delen kan als je weer verbinding hebt.*, where *Boekingslink delen* is off for lack of a connection.
    var shareLinkOfflineText: String? { isOffline && showsShareLink ? catalog[.classShareLinkOffline] : nil }

    var shareLinkFailureText: String? {
        switch share.failure {
        case .noPermission: catalog[.bookingLinkErrorNoPermission]
        case .notShared: catalog[.bookingLinkErrorGeneric]
        case nil: nil
        }
    }

    /// *Boekingslink delen*: gets or makes the link and copies its short URL.
    func shareLink() async {
        guard canTapShareLink else { return }
        await share.share(copiedText: catalog[.classShareLinkCopied])
    }
}
