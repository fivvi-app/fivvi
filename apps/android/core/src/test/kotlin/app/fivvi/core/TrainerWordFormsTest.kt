package app.fivvi.core

import app.fivvi.api.models.TrainerWord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The workspace's word for the people who teach (F068, spec #588), named after the shared test
 * (`trainer-word.test.ts`, AC5). The words themselves are checked against the generated strings in both languages by
 * `TrainerWordFormsTest` of the app's UI tests; this one checks, on the JVM, that each form of each word is read from
 * its own catalog message and from no other.
 */
class TrainerWordFormsTest {
    // Every string resource of the catalog by its ID, so a form can be named by the message it came from.
    private val names: Map<Int, String> = R.string::class.java.fields
        .filter { it.type == Int::class.javaPrimitiveType }
        .associate { it.getInt(null) to it.name }

    private fun nameOf(id: Int): String = names[id] ?: "no resource $id"

    private val suffixes = listOf("word", "words", "word_cap", "words_cap", "a_word", "a_word_cap")

    private fun formsOf(forms: TrainerWordForms) =
        listOf(forms.word, forms.words, forms.wordCap, forms.wordsCap, forms.aWord, forms.aWordCap)

    @Test
    fun test_F068_AC5_everyFormOfEveryWordIsReadFromItsOwnCatalogMessage() {
        for (choice in TrainerWord.entries) {
            val word = choice.value
            val forms = TrainerWordForms.of(choice, ::nameOf)

            assertEquals(
                choice.value,
                suffixes.map { "trainer_word_${word}_$it" },
                formsOf(forms),
            )
        }
    }

    @Test
    fun test_F068_AC5_theCatalogHasEverySuffixOfEveryWord() {
        for (choice in TrainerWord.entries) {
            for (suffix in suffixes) {
                val name = "trainer_word_${choice.value}_$suffix"
                assertTrue("$name is a string of the catalog", name in names.values)
            }
        }
    }
}
