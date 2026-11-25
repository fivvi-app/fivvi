package app.fivvi.pro

import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.TrainerWordForms
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.trainerRoleLabel
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * The workspace's word for the people who teach (F068, spec #588): the forms come from the generated strings in the
 * language shown, with the results of `trainerWordForms` in `packages/i18n` (`trainer-word.test.ts`, AC5), which these
 * tests are named after. They run in nl-NL and en.
 */
@RunWith(Parameterized::class)
class TrainerWordFormsTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    /** The six forms in the order of the shared test: word, words, Word, Words, aWord, AWord. */
    private fun expected(vararg forms: String): TrainerWordForms {
        check(forms.size == 6)
        return TrainerWordForms(forms[0], forms[1], forms[2], forms[3], forms[4], forms[5])
    }

    // The same table as `EXPECTED` in packages/i18n/src/trainer-word.test.ts, typed again here on purpose: the native
    // resolution is checked against the words themselves, not against the catalog it reads.
    private val table: Map<AppLanguage, Map<TrainerWord, TrainerWordForms>> = mapOf(
        AppLanguage.DUTCH to mapOf(
            TrainerWord.TRAINER to expected("trainer", "trainers", "Trainer", "Trainers", "een trainer", "Een trainer"),
            TrainerWord.INSTRUCTEUR to expected(
                "instructeur",
                "instructeurs",
                "Instructeur",
                "Instructeurs",
                "een instructeur",
                "Een instructeur",
            ),
            TrainerWord.DOCENT to expected("docent", "docenten", "Docent", "Docenten", "een docent", "Een docent"),
            TrainerWord.COACH to expected("coach", "coaches", "Coach", "Coaches", "een coach", "Een coach"),
        ),
        AppLanguage.ENGLISH to mapOf(
            TrainerWord.TRAINER to expected("trainer", "trainers", "Trainer", "Trainers", "a trainer", "A trainer"),
            TrainerWord.INSTRUCTEUR to expected(
                "instructor",
                "instructors",
                "Instructor",
                "Instructors",
                "an instructor",
                "An instructor",
            ),
            TrainerWord.DOCENT to expected("teacher", "teachers", "Teacher", "Teachers", "a teacher", "A teacher"),
            TrainerWord.COACH to expected("coach", "coaches", "Coach", "Coaches", "a coach", "A coach"),
        ),
    )

    private fun formsOf(choice: TrainerWord) = TrainerWordForms.of(choice) { localizedString(language, it) }

    @Test
    fun test_F068_AC5_everyFormOfEveryWordInTheLanguageShown() {
        for (choice in TrainerWord.entries) {
            assertEquals(
                "${choice.value} in ${language.tag}",
                table.getValue(language).getValue(choice),
                formsOf(choice),
            )
        }
    }

    @Test
    fun test_F068_AC5_theSpecsExamplesReadCorrectly() {
        val aInstructeur = formsOf(TrainerWord.INSTRUCTEUR).aWordCap
        val aDocent = formsOf(TrainerWord.DOCENT).aWordCap
        val docents = formsOf(TrainerWord.DOCENT).wordsCap
        if (language == AppLanguage.DUTCH) {
            assertEquals("Een instructeur", aInstructeur)
            assertEquals("Docenten", docents)
        } else {
            assertEquals("An instructor", aInstructeur)
            assertEquals("A teacher", aDocent)
        }
    }

    // The label of a Trainer's role is the word's capital form, through `roles.trainerLabel`.
    @Test
    fun test_F068_AC1_theRoleLabelIsTheCapitalFormOfTheWord() {
        val label = localizedResources(language).trainerRoleLabel(TrainerWord.INSTRUCTEUR)

        assertEquals(formsOf(TrainerWord.INSTRUCTEUR).wordCap, label)
        assertEquals(if (language == AppLanguage.DUTCH) "Instructeur" else "Instructor", label)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun parameters() = appLanguageParameters()
    }
}
