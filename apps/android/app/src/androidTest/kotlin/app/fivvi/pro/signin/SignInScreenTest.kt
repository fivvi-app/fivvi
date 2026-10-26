package app.fivvi.pro.signin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
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

    // The email step through to the code step. Sending the address finishes off the main thread (the request goes
    // through the fake network on a background thread), so the code step can appear later: wait for it first.
    private fun requestTheCode() {
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput(ADDRESS)
        compose.onNodeWithTag(SignInTags.SEND).performClick()
        compose.waitUntil(TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(SignInTags.CODE)).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
    }

    // The sign-in finishes off the main thread (the token is stored), so wait for the home.
    private fun assertSignedInAs(address: String) {
        compose.waitUntil(TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(HomeTags.SIGNED_IN_AS)).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(language, R.string.home_signed_in_as, address))
    }

    @Test
    fun F001N_AC1_emailRequestsTheCodeAndTheCodeStepShowsTheAddress() {
        signIn.answerAccepted()
        launch()

        requestTheCode()

        assertEquals(listOf(SignInRequest(ADDRESS, language.apiLocale)), signIn.requests)
        compose.onNodeWithText(app.string(language, R.string.sign_in_check_email_body_app, ADDRESS))
            .assertIsDisplayed()
        assertEquals(0, me.calls)
    }

    @Test
    fun F001N_AC3_sixthDigitSubmits() {
        signIn.answerAccepted()
        signIn.answerToken("token-1")
        me.answerAccount(ADDRESS)
        launch()
        requestTheCode()

        // Five digits wait; the sixth sends the code without another tap.
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("12345")
        assertEquals(0, signIn.exchanges.size)
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("6")

        assertSignedInAs(ADDRESS)
        assertEquals(listOf(SignInTokenRequest(ADDRESS, "123456")), signIn.exchanges)
        assertEquals("token-1", store.read())
        assertEquals(1, me.calls)
    }

    @Test
    fun F001N_AC3_pastedCodeSubmits() {
        signIn.answerAccepted()
        signIn.answerToken("token-1")
        me.answerAccount(ADDRESS)
        launch()
        requestTheCode()

        // Pasted whole, as the mail shows it, with a space in the middle.
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123 456")

        assertSignedInAs(ADDRESS)
        assertEquals(listOf(SignInTokenRequest(ADDRESS, "123456")), signIn.exchanges)
    }

    @Test
    fun F001N_AC4_signedInAddressComesFromTheMeEndpoint() {
        signIn.answerAccepted()
        signIn.answerToken("token-1")
        me.answerAccount("someone.else@example.com")
        launch()
        requestTheCode()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        assertSignedInAs("someone.else@example.com")
    }

    @Test
    fun F001N_AC6_wrongCodeShowsTheMessageAndStaysOnTheCodeStep() {
        signIn.answerAccepted()
        signIn.answerCodeRefused()
        launch()
        requestTheCode()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        // The refused code is answered off the main thread, so the message can appear later: wait for it first.
        compose.waitUntil(TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(SignInTags.ERROR)).fetchSemanticsNodes().isNotEmpty()
        }
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
        private const val ADDRESS = "owner@example.com"
        private const val TIMEOUT_MILLIS = 5_000L

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
