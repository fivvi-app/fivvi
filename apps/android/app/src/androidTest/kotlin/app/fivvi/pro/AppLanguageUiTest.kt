package app.fivvi.pro

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.hello.HelloTags
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC3 through the real activity: the OS language settings decide both the screen's resources and the API locale.
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
    fun E008_AC3_screenAndApiFollowTheAppLanguage() {
        val api = FakeHelloApi().apply { answerGreeting() }

        app.launch(api, device = device, perApp = perApp)

        compose.onNodeWithTag(HelloTags.GREETING).assertTextEquals(app.string(expected, R.string.hello_title))
        assertEquals(listOf(expected.apiLocale), api.requestedLocales)
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
