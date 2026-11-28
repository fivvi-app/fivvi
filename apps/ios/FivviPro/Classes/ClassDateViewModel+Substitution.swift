import FivviAPI
import FivviStrings

/// TD-03 of a substituted date (F024): who the date's trainer replaces, the covering trainer's banner and the Owner's
/// *Vervang de trainer*, which points to the web (`substituteTapped`).
extension ClassDateViewModel {
    /// Whom the date's trainer replaces, when the API says and gives a name.
    var originalTrainer: String? {
        guard let name = session?.substituteFor?.value1.name, !name.isEmpty else { return nil }
        return name
    }

    /// *Je valt in voor Sarah*, for the person who covers the date; nil for everyone else.
    var substitutionBannerText: String? {
        guard let original = originalTrainer, session?.trainer?.id == workspace.teamMemberId else { return nil }
        return catalog.string(.todayCoveringFor, original)
    }

    /// *Vervang de trainer* is in the menu of a date that has a trainer to replace.
    var showsSubstitute: Bool { hasMenu && session?.trainer != nil }
    var substituteText: String { catalog.string(.classDateSubstituteAction, words.word) }
}
