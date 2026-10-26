package app.fivvi.pro.signin

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
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
import app.fivvi.pro.signin.SignInSteps.Companion.ADDRESS
import java.io.IOException
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

// TM-01's recovery paths in the real activity, with the device in each catalog language: a wrong code, a new email, a
// changed address, a lost connection and the keys of the soft keyboard (AC6, AC1, AC3).
@RunWith(Parameterized::class)
class SignInRecoveryTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val signIn = FakeSignInApi()
    private val me = FakeMeApi()
    private val store = InMemorySessionStore()
    private val steps = SignInSteps(compose, app, signIn, language)

    private fun launch() = app.launch(
        FakeHelloApi().apply { answerGreeting() },
        device = listOf(language.tag),
        signInApi = signIn,
        meApi = me,
        session = Session(store),
    )

    private fun string(id: Int, vararg args: Any) = app.string(language, id, *args)

    private fun liveRegion() = SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite)

    @Test
    fun F001N_AC6_wrongCodeShowsTheNeutralMessageAndAllowsAnotherTry() {
        signIn.answerAccepted()
        signIn.answerCodeRefused()
        signIn.answerToken("token-2")
        me.answerAccount()
        launch()
        steps.requestTheCode()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("111111")

        compose.onNodeWithTag(SignInTags.ERROR)
            .assertTextEquals(string(R.string.sign_in_errors_invalid_or_expired_code))
        // The field is ready for the next try: empty and focused, with no tap.
        compose.onNodeWithTag(SignInTags.CODE).assertIsFocused()
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("222222")
        steps.assertSignedInAs()
        assertEquals(listOf("111111", "222222"), signIn.exchanges.map { it.code })
    }

    @Test
    fun F001N_AC6_errorIsAnnounced() {
        signIn.answerAccepted()
        signIn.answerCodeRefused()
        launch()
        steps.requestTheCode()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        compose.onNodeWithTag(SignInTags.ERROR).assert(liveRegion())
    }

    @Test
    fun F001N_AC6_resendRequestsNewEmail() {
        signIn.answerAccepted()
        signIn.answerAccepted()
        launch()
        steps.requestTheCode()

        steps.press(SignInTags.RESEND)

        assertEquals(List(2) { SignInRequest(ADDRESS, language.apiLocale) }, signIn.requests)
        compose.onNodeWithTag(SignInTags.RESENT).assertTextEquals(string(R.string.sign_in_resent, ADDRESS))
        compose.onNodeWithTag(SignInTags.RESENT).assert(liveRegion())
        compose.onNodeWithTag(SignInTags.CODE).assertIsFocused()
    }

    @Test
    fun F001N_AC6_resendFailureShowsTheMessageAndStaysOnTheCodeStep() {
        signIn.answerAccepted()
        signIn.requestAnswers += { Response.error(500, "{}".toResponseBody()) }
        launch()
        steps.requestTheCode()

        steps.press(SignInTags.RESEND)

        compose.onNodeWithTag(SignInTags.ERROR).assertTextEquals(string(R.string.sign_in_errors_generic))
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
    }

    @Test
    fun F001N_AC1_changeAddressKeepsTheAddress() {
        signIn.answerAccepted()
        signIn.answerAccepted()
        launch()
        steps.requestTheCode()

        steps.press(SignInTags.CHANGE_EMAIL)

        compose.onNodeWithTag(SignInTags.EMAIL).assertTextContains(ADDRESS).assertIsFocused()
        compose.onNodeWithTag(SignInTags.EMAIL).performTextReplacement("other@example.com")
        steps.press(SignInTags.SEND)
        assertEquals(listOf(ADDRESS, "other@example.com"), signIn.requests.map { it.email })
        compose.onNodeWithTag(SignInTags.CHECK_EMAIL)
            .assertTextEquals(string(R.string.sign_in_check_email_body_app, "other@example.com"))
    }

    @Test
    fun F001N_AC1_lostConnectionOffersRetry() {
        signIn.requestAnswers += { throw IOException("offline") }
        signIn.answerAccepted()
        launch()

        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput(ADDRESS)
        steps.press(SignInTags.SEND)

        compose.onNodeWithTag(SignInTags.ERROR).assertTextEquals(string(R.string.sign_in_errors_no_connection))
        compose.onNodeWithTag(SignInTags.RETRY).assertTextEquals(string(R.string.common_retry))
        compose.onNodeWithTag(SignInTags.EMAIL).assertTextContains(ADDRESS)
        steps.press(SignInTags.RETRY)
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
        assertEquals(2, signIn.requests.size)
    }

    @Test
    fun F001N_AC1_lostConnectionOnTheCodeStepKeepsTheCode() {
        signIn.answerAccepted()
        signIn.tokenAnswers += { throw IOException("offline") }
        signIn.answerToken("token-3")
        me.answerAccount()
        launch()
        steps.requestTheCode()

        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        compose.onNodeWithTag(SignInTags.ERROR).assertTextEquals(string(R.string.sign_in_errors_no_connection))
        compose.onNodeWithTag(SignInTags.CODE).assertTextContains("123456")
        steps.press(SignInTags.RETRY)
        steps.assertSignedInAs()
        assertEquals(List(2) { SignInTokenRequest(ADDRESS, "123456") }, signIn.exchanges)
    }

    @Test
    fun F001N_AC1_doneKeyOnTheEmailFieldSendsTheCode() {
        signIn.answerAccepted()
        launch()
        compose.onNodeWithTag(SignInTags.EMAIL).performClick()
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput(ADDRESS)

        compose.onNodeWithTag(SignInTags.EMAIL).performImeAction()

        assertEquals(1, signIn.requests.size)
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
    }

    @Test
    fun F001N_AC3_doneKeyOnTheCodeFieldChecksTheCode() {
        // A kept code (after a lost connection) is checked again with the Done key.
        signIn.answerAccepted()
        signIn.tokenAnswers += { throw IOException("offline") }
        signIn.answerToken("token-4")
        me.answerAccount()
        launch()
        steps.requestTheCode()
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")
        compose.onNodeWithTag(SignInTags.ERROR).assertIsDisplayed()

        compose.onNodeWithTag(SignInTags.CODE).performImeAction()

        steps.assertSignedInAs()
        assertEquals(2, signIn.exchanges.size)
    }

    @Test
    fun F001N_AC3_oneTimeCodeAutofillSubmits() {
        signIn.answerAccepted()
        signIn.answerToken("token-5")
        me.answerAccount()
        launch()
        steps.requestTheCode()

        // The phone fills the field in one go, as the SMS autofill does: no typing, no tap.
        compose.onNodeWithTag(SignInTags.CODE).performTextReplacement("493817")

        steps.assertSignedInAs()
        assertEquals(listOf(SignInTokenRequest(ADDRESS, "493817")), signIn.exchanges)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
