import FivviAPI
import FivviStrings

/// The workspace's word for the people who teach (F068, `packages/i18n/README.md`): *trainer*, *instructeur*, *docent* or
/// *coach*, in the six forms the catalog has for the reader's language. Every message that names them takes a form, so
/// no screen says *trainer* itself. Read from `trainerWord.<choice>.<form>`; the web builds the same with
/// `trainerWordForms`.
struct TrainerWordForms: Equatable {
    /// *trainer*, inside a sentence.
    let word: String
    /// *Trainer*, at the start of a message.
    let wordCap: String
    /// *een trainer*
    let aWord: String

    init(_ choice: Components.Schemas.TrainerWord, catalog: Catalog) {
        func form(_ name: String) -> String {
            catalog.string(forKey: "trainerWord.\(choice.rawValue).\(name)") ?? ""
        }
        word = form("word")
        wordCap = form("wordCap")
        aWord = form("aWord")
    }
}
