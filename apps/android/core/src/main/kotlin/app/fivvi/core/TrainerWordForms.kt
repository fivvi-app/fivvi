package app.fivvi.core

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import app.fivvi.api.models.TrainerWord

/**
 * The workspace's word for the people who teach (F068, spec #588): *trainer*, *instructeur*, *docent* or *coach*, in the six
 * forms the catalog has for the reader's language, `trainerWord.<choice>.<form>`. It mirrors `trainerWordForms` in
 * `packages/i18n` (`trainer-word.ts`), and its tests are named after the shared one (`F068_AC5`). The words and their
 * grammar (the capital, *a* or *an*, *een*) live in the catalogs, not here: no rule is in the app, so a message that names the
 * role takes one form from this and no screen says *trainer* itself. It lives in the core module so that the Fivvi client
 * app uses the same.
 *
 * The role stays Trainer in code and in the API's values; this is only the label.
 */
data class TrainerWordForms(
    /** *trainer*, inside a sentence (`{word}`). */
    val word: String,
    /** *trainers*, inside a sentence (`{words}`). */
    val words: String,
    /** *Trainer*, at the start of a message (`{Word}`). */
    val wordCap: String,
    /** *Trainers*, at the start of a message (`{Words}`). */
    val wordsCap: String,
    /** *een trainer* / *a trainer*, inside a sentence (`{aWord}`). */
    val aWord: String,
    /** *Een trainer* / *A trainer*, at the start of a message (`{AWord}`). */
    val aWordCap: String,
) {
    companion object {
        /** The forms of [choice], each read from the catalog with [text] (a resource ID to its string). */
        fun of(choice: TrainerWord, text: (Int) -> String): TrainerWordForms = when (choice) {
            TrainerWord.TRAINER -> TrainerWordForms(
                text(R.string.trainer_word_trainer_word),
                text(R.string.trainer_word_trainer_words),
                text(R.string.trainer_word_trainer_word_cap),
                text(R.string.trainer_word_trainer_words_cap),
                text(R.string.trainer_word_trainer_a_word),
                text(R.string.trainer_word_trainer_a_word_cap),
            )

            TrainerWord.INSTRUCTEUR -> TrainerWordForms(
                text(R.string.trainer_word_instructeur_word),
                text(R.string.trainer_word_instructeur_words),
                text(R.string.trainer_word_instructeur_word_cap),
                text(R.string.trainer_word_instructeur_words_cap),
                text(R.string.trainer_word_instructeur_a_word),
                text(R.string.trainer_word_instructeur_a_word_cap),
            )

            TrainerWord.DOCENT -> TrainerWordForms(
                text(R.string.trainer_word_docent_word),
                text(R.string.trainer_word_docent_words),
                text(R.string.trainer_word_docent_word_cap),
                text(R.string.trainer_word_docent_words_cap),
                text(R.string.trainer_word_docent_a_word),
                text(R.string.trainer_word_docent_a_word_cap),
            )

            TrainerWord.COACH -> TrainerWordForms(
                text(R.string.trainer_word_coach_word),
                text(R.string.trainer_word_coach_words),
                text(R.string.trainer_word_coach_word_cap),
                text(R.string.trainer_word_coach_words_cap),
                text(R.string.trainer_word_coach_a_word),
                text(R.string.trainer_word_coach_a_word_cap),
            )
        }
    }
}

/** The forms of [choice] in the language of these resources. */
fun Resources.trainerWordForms(choice: TrainerWord): TrainerWordForms = TrainerWordForms.of(choice) { getString(it) }

/**
 * The label of the Trainer role in a workspace that uses [choice]: *Instructeur* / *Instructor*, *Docent* / *Teacher*
 * (`roles.trainerLabel`, `{Word}`). A label only: the role itself stays Trainer.
 */
fun Resources.trainerRoleLabel(choice: TrainerWord): String =
    getString(R.string.roles_trainer_label, trainerWordForms(choice).wordCap)

/** The forms of [choice] in the language shown. */
@Composable
fun trainerWordForms(choice: TrainerWord): TrainerWordForms = LocalContext.current.resources.trainerWordForms(choice)

/** The label of the Trainer role in a workspace that uses [choice], in the language shown. */
@Composable
fun trainerRoleLabel(choice: TrainerWord): String = LocalContext.current.resources.trainerRoleLabel(choice)
