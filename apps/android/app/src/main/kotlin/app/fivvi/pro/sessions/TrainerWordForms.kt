package app.fivvi.pro.sessions

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.R

/**
 * The workspace's word for the people who teach (F068, `packages/i18n/README.md`): *trainer*, *instructeur*, *docent* or
 * *coach*, in the forms the catalog has for the reader's language. Every message that names them takes a form, so no
 * screen says *trainer* itself. The web builds the same with `trainerWordForms`.
 */
data class TrainerWordForms(
    /** *trainer*, inside a sentence. */
    val word: String,
    /** *Trainer*, at the start of a message. */
    val wordCap: String,
    /** *een trainer* */
    val aWord: String,
    /** *trainers*, inside a sentence. */
    val words: String,
) {
    companion object {
        /** The forms of [choice], each read from the catalog with [text] (a resource ID to its string). */
        fun of(choice: TrainerWord, text: (Int) -> String): TrainerWordForms = when (choice) {
            TrainerWord.TRAINER -> TrainerWordForms(
                text(R.string.trainer_word_trainer_word),
                text(R.string.trainer_word_trainer_word_cap),
                text(R.string.trainer_word_trainer_a_word),
                text(R.string.trainer_word_trainer_words),
            )

            TrainerWord.INSTRUCTEUR -> TrainerWordForms(
                text(R.string.trainer_word_instructeur_word),
                text(R.string.trainer_word_instructeur_word_cap),
                text(R.string.trainer_word_instructeur_a_word),
                text(R.string.trainer_word_instructeur_words),
            )

            TrainerWord.DOCENT -> TrainerWordForms(
                text(R.string.trainer_word_docent_word),
                text(R.string.trainer_word_docent_word_cap),
                text(R.string.trainer_word_docent_a_word),
                text(R.string.trainer_word_docent_words),
            )

            TrainerWord.COACH -> TrainerWordForms(
                text(R.string.trainer_word_coach_word),
                text(R.string.trainer_word_coach_word_cap),
                text(R.string.trainer_word_coach_a_word),
                text(R.string.trainer_word_coach_words),
            )
        }
    }
}

/** The forms of [choice] in the language shown. */
@Composable
fun trainerWordForms(choice: TrainerWord): TrainerWordForms {
    val resources = LocalContext.current.resources
    return TrainerWordForms.of(choice, resources::getString)
}
