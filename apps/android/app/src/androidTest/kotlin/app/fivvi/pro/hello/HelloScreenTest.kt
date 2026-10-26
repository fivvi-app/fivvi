package app.fivvi.pro.hello

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.localizedString
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// The hello screen in the real activity, with the device in each catalog language.
@RunWith(Parameterized::class)
class HelloScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val api = FakeHelloApi()

    private fun launch() = app.launch(api, device = listOf(language.tag))

    @Test
    fun E008_AC2_loadsGreetingInAppLanguage() {
        api.answerGreeting()
        launch()

        compose.onNodeWithTag(HelloTags.GREETING).assertTextEquals(localizedString(language, R.string.hello_title))
        assertEquals(listOf(language.apiLocale), api.requestedLocales)
    }

    @Test
    fun E008_AC4_errorStateShowsRetry() {
        api.answers += { throw IOException("offline") }
        api.answerGreeting()
        launch()

        compose.onNodeWithTag(HelloTags.ERROR).assertTextEquals(localizedString(language, R.string.hello_error))
        compose.onNodeWithTag(HelloTags.RETRY)
            .assertTextEquals(localizedString(language, R.string.common_retry))
            .assertHasClickAction()
            .performClick()
        compose.onNodeWithTag(HelloTags.GREETING).assertTextEquals(localizedString(language, R.string.hello_title))
    }

    @Test
    fun E008_AC5_loadingIndicatorHasLabel() {
        val never = CompletableDeferred<Nothing>()
        api.answers += { never.await() }
        launch()

        compose.onNodeWithTag(HelloTags.LOADING)
            .assertContentDescriptionEquals(localizedString(language, R.string.common_loading))
    }

    @Test
    fun E008_AC7_greetingIsHeading() {
        api.answerGreeting()
        launch()

        compose.onNodeWithTag(HelloTags.GREETING).assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
