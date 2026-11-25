import FivviAPI
import FivviStrings

/// *Niveau* (F067) on TD-05: *Geen* to start with, then the four levels, sent with the quick create.
extension NewGroupClassViewModel {
    /// One choice of the field.
    struct LevelOption: Equatable {
        let level: Components.Schemas.ClassLevel?
        let text: String
    }

    var levelLabel: String { catalog[.classLevelField] }

    /// *Geen*, then *Alle niveaus*, *Beginner*, *Gemiddeld* and *Gevorderd*, worded in the viewer's language.
    var levelOptions: [LevelOption] {
        ([nil] + Components.Schemas.ClassLevel.fieldOrder.map { Optional($0) }).map {
            LevelOption(level: $0, text: catalog.levelWord($0))
        }
    }
}
