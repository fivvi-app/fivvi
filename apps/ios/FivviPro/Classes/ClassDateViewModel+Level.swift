import FivviAPI
import FivviStrings

/// TD-03's level (F067): the same for everyone on the team, read from the date (`Session.level`); nil is *Geen*.
extension ClassDateViewModel {
    /// The level of this date (F067), the same for everyone on the team; nil is *Geen*.
    var level: Components.Schemas.ClassLevel? { session?.level }
    var showsLevelIcon: Bool { level != nil }
    /// *Niveau: Gevorderd*; nil for *Geen*.
    var levelAccessibleName: String? { level.map { catalog.levelAccessibleName($0) } }

    /// The eyebrow of TD-03: *Groepsles · Gevorderd*, or just *Groepsles* for *Geen*, with no separator left over.
    var eyebrowText: String {
        let type = catalog[.newGroupClass]
        guard let level else { return type }
        // Placeholders in the order of their names: level, type.
        return catalog.string(.classTypeAndLevel, catalog.levelWord(level), type)
    }
}
