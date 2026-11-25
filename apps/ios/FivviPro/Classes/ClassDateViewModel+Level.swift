import FivviAPI
import FivviUI
import FivviStrings

/// TD-03's level (F067): the same for everyone on the team, read from the date (`Session.level`); nil is *Geen*.
extension ClassDateViewModel {
    /// The level of this date (F067), the same for everyone on the team; nil is *Geen*.
    var level: Components.Schemas.ClassLevel? { session?.level }
    /// The bars next to the eyebrow's level word (the word is already beside them); nil for *Geen*, which draws nothing.
    /// The icon's own accessible name is *Niveau: Gevorderd*.
    var levelIcon: LevelIcon? {
        level.map { LevelIcon(level: $0, catalog: catalog, form: .bars, identifier: "classDate.level") }
    }

    /// The eyebrow of TD-03: *Groepsles · Gevorderd*, or just *Groepsles* for *Geen*, with no separator left over.
    var eyebrowText: String {
        let type = catalog[.newGroupClass]
        guard let level else { return type }
        // Placeholders in the order of their names: level, type.
        return catalog.string(.classTypeAndLevel, catalog.levelWord(level), type)
    }
}
