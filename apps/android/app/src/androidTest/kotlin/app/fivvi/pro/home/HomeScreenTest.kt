package app.fivvi.pro.home

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.hello.HelloTags
import app.fivvi.pro.signin.SignInTags
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// A stored token opens the home, which calls the account through the generated client.
@RunWith(Parameterized::class)
class HomeScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val hello = FakeHelloApi().apply { answerGreeting() }
    private val me = FakeMeApi()
    private val store = InMemorySessionStore("token-1")

    private fun launch() = app.launch(hello, device = listOf(language.tag), meApi = me, session = Session(store))

    @Test
    fun F001N_AC4_storedTokenOpensHomeWithTheAccountsAddress() {
        me.answerAccount("owner@example.com")
        launch()

        awaitTag(HelloTags.GREETING)
        compose.onNodeWithTag(HelloTags.GREETING).assertTextEquals(app.string(language, R.string.hello_title))
        awaitTag(HomeTags.SIGNED_IN_AS)
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(language, R.string.home_signed_in_as, "owner@example.com"))
        assertEquals(1, me.calls)
    }

    @Test
    fun F001N_AC4_failedAccountCallShowsRetry() {
        me.answers += { throw IOException("offline") }
        me.answerAccount("owner@example.com")
        launch()

        awaitTag(HomeTags.ERROR)
        compose.onNodeWithTag(HomeTags.ERROR).assertTextEquals(app.string(language, R.string.sign_in_errors_generic))
        compose.onNodeWithTag(HomeTags.RETRY).performClick()

        awaitTag(HomeTags.SIGNED_IN_AS)
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(language, R.string.home_signed_in_as, "owner@example.com"))
    }

    @Test
    fun F001N_AC9_aSessionThatEndsGoesBackToSignIn() {
        // What the auth layer does on a 401 (AuthInterceptorTest); the screen follows the session.
        me.answerAccount()
        val session = Session(store)
        app.launch(hello, device = listOf(language.tag), meApi = me, session = session)
        awaitTag(HomeTags.SIGNED_IN_AS)
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS).assertIsDisplayed()

        session.expire("token-1")

        compose.onNodeWithTag(SignInTags.EMAIL).assertIsDisplayed()
        assertNull(store.read())
    }

    // The greeting and the account come from the fake network on background threads: wait for each before asserting.
    private fun awaitTag(tag: String) {
        compose.waitUntil(TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    companion object {
        private const val TIMEOUT_MILLIS = 5_000L

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
