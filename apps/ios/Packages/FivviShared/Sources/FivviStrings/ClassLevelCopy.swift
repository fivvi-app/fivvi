import FivviAPI

/// The words of a class's level (F067, `classLevel.*` in packages/i18n): one fixed list of four levels, and *Geen* for a
/// class without one. A level is not translated user content: the catalog gives the word in the viewer's language.
extension StringKey {
    public static let classLevelField = StringKey("classLevel.field")
    public static let classLevelNone = StringKey("classLevel.none")
    public static let classLevelAllLevels = StringKey("classLevel.allLevels")
    public static let classLevelBeginner = StringKey("classLevel.beginner")
    public static let classLevelIntermediate = StringKey("classLevel.intermediate")
    public static let classLevelAdvanced = StringKey("classLevel.advanced")
    public static let classLevelAccessibleName = StringKey("classLevel.accessibleName")
    public static let classTypeAndLevel = StringKey("classes.date.typeAndLevel")
}

extension Components.Schemas.ClassLevel {
    /// The levels in the order of the field: *Alle niveaus*, *Beginner*, *Gemiddeld*, *Gevorderd* (*Geen* comes first, as nil).
    public static let fieldOrder: [Components.Schemas.ClassLevel] = [.allLevels, .beginner, .intermediate, .advanced]

    /// How many of the three bars are filled: 1 for *Beginner*, 2 for *Gemiddeld*, 3 for *Gevorderd*; *Alle niveaus*
    /// fills all three at the same weight.
    public var filledBars: Int {
        switch self {
        case .beginner: 1
        case .intermediate: 2
        case .advanced, .allLevels: 3
        }
    }

    /// A list (a row) shows the icon for the three levels with a rank; *Alle niveaus* shows none there.
    public var showsInList: Bool { self != .allLevels }

    var key: StringKey {
        switch self {
        case .allLevels: .classLevelAllLevels
        case .beginner: .classLevelBeginner
        case .intermediate: .classLevelIntermediate
        case .advanced: .classLevelAdvanced
        }
    }
}

extension Catalog {
    /// *Gevorderd* / *Advanced*; *Geen* / *None* for a class without a level.
    public func levelWord(_ level: Components.Schemas.ClassLevel?) -> String {
        self[level?.key ?? .classLevelNone]
    }

    /// The icon's accessible name: *Niveau: Gevorderd* / *Level: Advanced*.
    public func levelAccessibleName(_ level: Components.Schemas.ClassLevel) -> String {
        string(.classLevelAccessibleName, levelWord(level))
    }
}
