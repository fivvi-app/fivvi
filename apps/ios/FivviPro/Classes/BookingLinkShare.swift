import Foundation
import Observation
import FivviAPI
import FivviUI

/// The request of *Boekingslink delen* on TD-03 (F037 AC8, AC9; Android twin: #978): gets or makes the link of one class
/// date in the visitor's language (`POST …/booking-links`: the same link every time, for everyone on the team), puts its
/// short URL on the clipboard and shows "Boekingslink gekopieerd" as a toast (which announces itself to VoiceOver). Why a
/// share didn't happen is kept for the screen to say; offline nothing is queued.
@MainActor
@Observable
final class BookingLinkShare {
    /// What a share that didn't happen says (offline has its own text on the screen).
    enum Failure: Equatable {
        case noPermission
        case notShared
    }

    /// A request is on its way.
    private(set) var isSharing = false
    private(set) var failure: Failure?
    /// The request couldn't reach the API (the fallback when the phone's network path said online).
    private(set) var requestFailedOffline = false
    /// "Boekingslink gekopieerd", until the screen has shown it; nil when none is showing.
    private(set) var toast: ToastMessage?

    private let api: any APIProtocol
    private let workspaceID: String
    private let sessionID: String
    /// Puts a text on the phone's clipboard.
    private let copy: @MainActor (String) -> Void
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspaceID: String, sessionID: String, copy: @escaping @MainActor (String) -> Void,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void
    ) {
        self.api = api
        self.workspaceID = workspaceID
        self.sessionID = sessionID
        self.copy = copy
        self.onForbidden = onForbidden
    }

    func clearOffline() { requestFailedOffline = false }

    /// Takes the toast away, once it has been shown.
    func dismissToast() { toast = nil }

    /// Gets or makes the link and copies its short URL; `copiedText` is what the toast says.
    func share(copiedText: String) async {
        guard !isSharing else { return }
        isSharing = true
        failure = nil
        toast = nil
        defer { isSharing = false }
        let body = Components.Schemas.CreateBookingLinkRequest(
            scope: .session, language: .visitor, sessionId: sessionID, surface: .ios
        )
        do {
            let input = Operations.CreateBookingLink.Input(path: .init(workspaceId: workspaceID), body: .json(body))
            switch try await api.createBookingLink(input) {
            case let .ok(found):
                finish(try found.body.json, copiedText: copiedText)
            case let .created(made):
                finish(try made.body.json, copiedText: copiedText)
            case .forbidden:
                failure = .noPermission
                await onForbidden(.bookingLink_copy)
            default:
                failure = .notShared
            }
        } catch {
            switch ClientRequestError(thrown: error) {
            case .offline: requestFailedOffline = true
            case .cancelled: break
            default: failure = .notShared
            }
        }
    }

    private func finish(_ link: Components.Schemas.BookingLink, copiedText: String) {
        requestFailedOffline = false
        copy(link.url)
        toast = ToastMessage(kind: .success, text: copiedText)
    }
}
