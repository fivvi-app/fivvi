package app.fivvi.pro

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.pro.home.HomeTags
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC3 through the real activity: the OS language settings decide the language of the screen's resources.
@RunWith(Parameterized::class)
class AppLanguageUiTest(
    @Suppress("UNUSED_PARAMETER") case: String,
    private val perApp: List<String>,
    private val device: List<String>,
    private val expected: AppLanguage,
) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    @Test
    fun E008_AC3_screenFollowsTheAppLanguage() {
        app.launch(device = device, perApp = perApp)

        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(localizedString(expected, R.string.sign_out_label))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases() = listOf(
            arrayOf<Any>("unsupported device language", emptyList<String>(), listOf("de-DE"), AppLanguage.ENGLISH),
            arrayOf<Any>("no device languages", emptyList<String>(), emptyList<String>(), AppLanguage.ENGLISH),
            arrayOf<Any>("first supported is Dutch", emptyList<String>(), listOf("fr-FR", "nl-BE"), AppLanguage.DUTCH),
            arrayOf<Any>(
                "first supported is English",
                emptyList<String>(),
                listOf("de-DE", "en-GB", "nl-NL"),
                AppLanguage.ENGLISH,
            ),
            arrayOf<Any>("per-app Dutch on a German device", listOf("nl"), listOf("de-DE"), AppLanguage.DUTCH),
            arrayOf<Any>("per-app English on a Dutch device", listOf("en"), listOf("nl-NL"), AppLanguage.ENGLISH),
        )
    }
}
