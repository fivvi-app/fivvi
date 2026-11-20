import Foundation
import FivviAPI
import FivviStrings

/// PS-07 *Dubbele boeking* (F023 AC6, iOS): what the native alert says when the API refused a save with `409`
/// `trainer_conflict`, a soft warning about the trainer's other sessions of this workspace. The API finds the overlaps
/// (the app has no rule of its own, AC7); this words them: "{trainer} heeft dan al iets", or "Je hebt dan al iets" when
/// the person plans for themself, then one line per session, *Terug* · *Toch opslaan*. *Toch opslaan* sends the same
/// request again with `allowConflicts`.
struct DoubleBooking: Equatable {
    typealias Item = Components.Schemas.TrainerConflictItem

    let conflicts: [Item]
    /// The trainer's name; nil when the person plans for themself.
    let trainerName: String?

    func title(_ catalog: Catalog) -> String {
        guard let trainerName else { return catalog[.doubleBookingTitleOwn] }
        return catalog.string(.doubleBookingTitle, trainerName)
    }

    /// *do 24 sep, 09:00–10:00: Mark Jansen (privésessie)*, one line per session, as the API listed them.
    func message(_ catalog: Catalog, format: SessionFormat) -> String {
        conflicts.map { line($0, catalog, format) }.joined(separator: "\n")
    }

    private func line(_ item: Item, _ catalog: Catalog, _ format: SessionFormat) -> String {
        catalog.string(
            .doubleBookingItem, format.day(item.startsAt), format.time(item.endsAt), name(item, catalog),
            format.time(item.startsAt), type(item, catalog)
        )
    }

    /// A class has a Dutch and maybe an English name: the viewer's language, else Dutch (`pickContentLanguage`).
    private func name(_ item: Item, _ catalog: Catalog) -> String {
        guard catalog.locale == .en, let english = item.displayNameEn, !english.isEmpty else { return item.displayName }
        return english
    }

    private func type(_ item: Item, _ catalog: Catalog) -> String {
        switch item._type {
        case ._private: catalog[.doubleBookingTypePrivate]
        case .group: catalog[.doubleBookingTypeGroup]
        case .openGym: catalog[.doubleBookingTypeOpenGym]
        }
    }
}
