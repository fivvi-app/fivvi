import FivviAPI

/// The workspace's word for the people who teach (F068, spec #588): *trainer*, *instructeur*, *docent* or *coach*, in the
/// six forms the catalog has for the reader's language, `trainerWord.<choice>.<form>`. It mirrors `trainerWordForms` in
/// packages/i18n (`trainer-word.ts`), and its tests are named after the shared one (`test_F068_AC5`). The words and their
/// grammar (the capital, *a* or *an*, *een*) live in the catalogs, not here: no rule is in the app, so a message that
/// names the role takes one form from this and no screen says *trainer* itself.
///
/// The role stays Trainer in code and in the API's values; this is only the label.
public struct TrainerWordForms: Equatable, Sendable {
    /// *trainer*, inside a sentence (`{word}`).
    public let word: String
    /// *trainers*, inside a sentence (`{words}`).
    public let words: String
    /// *Trainer*, at the start of a message (`{Word}`).
    public let wordCap: String
    /// *Trainers*, at the start of a message (`{Words}`).
    public let wordsCap: String
    /// *een trainer* / *an instructor*, inside a sentence (`{aWord}`).
    public let aWord: String
    /// *Een trainer* / *An instructor*, at the start of a message (`{AWord}`).
    public let aWordCap: String

    public init(_ choice: Components.Schemas.TrainerWord, catalog: Catalog) {
        func form(_ name: String) -> String {
            catalog.string(forKey: "trainerWord.\(choice.rawValue).\(name)") ?? ""
        }
        word = form("word")
        words = form("words")
        wordCap = form("wordCap")
        wordsCap = form("wordsCap")
        aWord = form("aWord")
        aWordCap = form("aWordCap")
    }
}

extension StringKey {
    /// The label of the Trainer role: the workspace's word, capitalised (`{Word}`).
    public static let rolesTrainerLabel = StringKey("roles.trainerLabel")
}

extension Catalog {
    /// The label of the Trainer role in a workspace that uses `choice`: *Instructeur* / *Instructor*, *Docent* /
    /// *Teacher*. A label only: the role itself stays Trainer.
    public func trainerRoleLabel(_ choice: Components.Schemas.TrainerWord) -> String {
        string(.rolesTrainerLabel, TrainerWordForms(choice, catalog: self).wordCap)
    }
}
