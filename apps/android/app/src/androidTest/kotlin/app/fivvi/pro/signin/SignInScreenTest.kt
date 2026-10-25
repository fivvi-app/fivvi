package app.fivvi.pro.signin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.HomeTags
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// The sign-in in the real activity, with the device in each catalog language: no token to the home and back.
@RunWith(Parameterized::class)
class SignInScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val hello = FakeHelloApi().apply { answerGreeting() }
    private val signIn = FakeSignInApi()
    private val me = FakeMeApi()
    private val store = InMemorySessionStore()

    private fun launch() = app.launch(
        hello,
        device = listOf(language.tag),
        signInApi = signIn,
        meApi = me,
        session = Session(store),
    )

    @Test
    fun F001N_AC13_noTokenShowsSignInAndMakesNoAuthenticatedCall() {
        launch()

        compose.onNodeWithTag(SignInTags.EMAIL).assertIsDisplayed()
        assertEquals(0, me.calls)
        assertEquals(0, signIn.requests.size)
        assertEquals(0, hello.requestedLocales.size)
    }

    @Test
    fun F001N_AC1_AC3_AC4_emailThenCodeThenHome() {
        signIn.answerAccepted()
        signIn.answerToken("token-1")
        me.answerAccount("owner@example.com")
        launch()

        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput("owner@example.com")
        compose.onNodeWithTag(SignInTags.SEND).performClick()

        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
        assertEquals(listOf(SignInRequest("owner@example.com", language.apiLocale)), signIn.requests)
        assertEquals(0, me.calls)

        // The sixth digit sends the code without another tap.
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(language, R.string.home_signed_in_as, "owner@example.com"))
        assertEquals(listOf(SignInTokenRequest("owner@example.com", "123456")), signIn.exchanges)
        assertEquals("token-1", store.read())
        assertEquals(1, me.calls)
    }

    @Test
    fun F001N_AC6_wrongCodeShowsTheMessageAndStaysOnTheCodeStep() {
        signIn.answerAccepted()
        signIn.answerCodeRefused()
        launch()
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput("owner@example.com")
        compose.onNodeWithTag(SignInTags.SEND).performClick()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        compose.onNodeWithTag(SignInTags.ERROR)
            .assertTextEquals(app.string(language, R.string.sign_in_errors_invalid_or_expired_code))
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
        assertEquals(0, me.calls)
    }

    @Test
    fun F001N_AC1_theScreenIsInTheAppLanguage() {
        launch()

        compose.onNodeWithTag(SignInTags.SEND).assertTextEquals(app.string(language, R.string.sign_in_send_code))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
