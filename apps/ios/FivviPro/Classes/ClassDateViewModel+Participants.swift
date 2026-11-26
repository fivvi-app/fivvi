import Foundation
import FivviStrings

/// TD-03's *Deelnemers · 7* (F025, #1616): the clients who hold a place on the date, each with the status the API has for
/// them (`Session.participants`; the app decides nothing), the first few and *Toon alle 7* for the rest. A client who
/// cancelled holds no place and is not listed. Nothing is listed for a date without bookings: the booked card says *Nog geen
/// boekingen.*
extension ClassDateViewModel {
    /// How many participants TD-03 lists before *Toon alle {n}* (the prototype's *Les (TD-03)*).
    static let shownParticipantCount = 5

    /// One row of the list: the name and the status; for VoiceOver "Anna de Vries, aanwezig".
    struct ParticipantRow: Equatable, Identifiable {
        let clientID: String
        let name: String
        let status: AttendanceStatus
        let statusText: String
        let spokenLabel: String
        var id: String { clientID }
    }

    private var participants: [ParticipantRow] {
        (session?.participants ?? []).compactMap { participant in
            let status = AttendanceStatus(rawValue: participant.attendanceStatus.rawValue) ?? .booked
            guard status != .cancelled else { return nil }
            let text = statusText(status)
            return ParticipantRow(
                clientID: participant.clientId, name: participant.name, status: status, statusText: text,
                spokenLabel: catalog.string(.attendanceRowLabel, participant.name, text.lowercased())
            )
        }
    }

    private func statusText(_ status: AttendanceStatus) -> String {
        switch status {
        case .booked: catalog[.attendanceBooked]
        case .attended: catalog[.attendanceAttended]
        case .noShow: catalog[.attendanceNoShow]
        case .cancelled: catalog[.attendanceCancelledStatus]
        }
    }

    var showsParticipants: Bool { booked > 0 }

    /// *Deelnemers · 7*
    var participantsTitleText: String { catalog.string(.attendanceParticipantsCount, String(booked)) }

    /// The first few participants, or all of them once *Toon alle* was tapped.
    var shownParticipants: [ParticipantRow] {
        participantsOpen ? participants : Array(participants.prefix(Self.shownParticipantCount))
    }

    var showsAllParticipantsButton: Bool { !participantsOpen && booked > Self.shownParticipantCount }

    /// *Toon alle 7*
    var showAllParticipantsText: String { catalog.string(.attendanceShowAll, String(booked)) }
}
