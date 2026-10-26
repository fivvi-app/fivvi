package app.fivvi.pro.signin

import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.auth.SessionStore
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(Parameterized::class)
class SignInViewModelTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    private val api = FakeSignInApi()
    private val store = InMemorySessionStore()
    private val session = Session(store)

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(session: Session = this.session) =
        SignInViewModel(api, session, language.apiLocale, dispatcher)

    private fun SignInViewModel.requestCode(email: String = EMAIL) {
        onEmailChange(email)
        sendCode()
    }

    @Test
    fun F001N_AC13_startsOnTheEmailStep() {
        assertEquals(SignInState.EmailEntry(), viewModel().state.value)
        assertEquals(emptyList<SignInRequest>(), api.requests)
    }

    @Test
    fun F001N_AC1_requestSendsAppLanguage() {
        api.answerAccepted()
        val viewModel = viewModel()

        viewModel.requestCode()

        assertEquals(listOf(SignInRequest(EMAIL, language.apiLocale)), api.requests)
        assertEquals(SignInState.CodeEntry(EMAIL), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_sendingUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<Unit>>()
        api.requestAnswers += { answer.await() }
        val viewModel = viewModel()

        viewModel.requestCode()
        assertEquals(SignInState.Sending(EMAIL), viewModel.state.value)

        answer.complete(Response.success(202, Unit))
        assertEquals(SignInState.CodeEntry(EMAIL), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_theAddressIsTrimmed() {
        api.answerAccepted()
        val viewModel = viewModel()

        viewModel.requestCode("  $EMAIL ")

        assertEquals(EMAIL, api.requests.single().email)
    }

    @Test
    fun F001N_AC1_blankAddressAsksForAValidOne() {
        val viewModel = viewModel()

        viewModel.requestCode("  ")

        assertEquals(SignInState.EmailEntry("  ", SignInError.InvalidEmail), viewModel.state.value)
        assertEquals(emptyList<SignInRequest>(), api.requests)
    }

    @Test
    fun F001N_AC16_malformedAddressShowsTheInvalidEmailMessage() {
        api.requestAnswers += { Response.error(400, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.requestCode("not an address")

        assertEquals(SignInState.EmailEntry("not an address", SignInError.InvalidEmail), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_offlineKeepsTheAddressAndShowsNoConnection() {
        api.requestAnswers += { throw IOException("offline") }
        val viewModel = viewModel()

        viewModel.requestCode()

        assertEquals(SignInState.EmailEntry(EMAIL, SignInError.NoConnection), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_serverErrorShowsGeneric() {
        api.requestAnswers += { Response.error(500, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.requestCode()

        assertEquals(SignInState.EmailEntry(EMAIL, SignInError.Generic), viewModel.state.value)
    }

    @Test
    fun F001N_AC3_codeStoresTokenAndShowsHome() {
        api.answerAccepted()
        api.answerToken("token-1")
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onCodeChange("12345")
        assertEquals(emptyList<SignInTokenRequest>(), api.exchanges)
        viewModel.onCodeChange("123456")

        assertEquals(listOf(SignInTokenRequest(EMAIL, "123456")), api.exchanges)
        assertEquals("token-1", store.read())
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC3_pastedCodeSubmits() {
        api.answerAccepted()
        api.answerToken()
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onCodeChange("123 456")

        assertEquals(listOf(SignInTokenRequest(EMAIL, "123456")), api.exchanges)
    }

    @Test
    fun F001N_AC3_onlySixDigitsAreKept() {
        api.answerAccepted()
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onCodeChange("12a3-4")

        assertEquals(SignInState.CodeEntry(EMAIL, "1234"), viewModel.state.value)
    }

    @Test
    fun F001N_AC3_checkingUntilTheApiAnswers() {
        api.answerAccepted()
        val answer = CompletableDeferred<Response<app.fivvi.api.models.SignInTokenResponse>>()
        api.tokenAnswers += { answer.await() }
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onCodeChange("123456")

        assertEquals(SignInState.Checking(EMAIL, "123456"), viewModel.state.value)
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC6_wrongCodeShowsNeutralMessage() {
        api.answerAccepted()
        api.answerCodeRefused()
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onCodeChange("123456")

        assertEquals(SignInState.CodeEntry(EMAIL, "", SignInError.InvalidCode), viewModel.state.value)
        assertEquals(null, store.read())
    }

    @Test
    fun F001N_AC1_typingTheAddressKeepsTheErrorAndRetryUntilTheNextAttempt() {
        api.requestAnswers += { throw IOException("offline") }
        api.answerAccepted()
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.onEmailChange("other@example.com")

        assertEquals(SignInState.EmailEntry("other@example.com", SignInError.NoConnection), viewModel.state.value)
        viewModel.retry()
        assertEquals(listOf("owner@example.com", "other@example.com"), api.requests.map { it.email })
        assertEquals(SignInState.CodeEntry("other@example.com"), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_typingTheCodeKeepsTheErrorUntilTheNextAttempt() {
        api.answerAccepted()
        api.answerCodeRefused()
        val viewModel = viewModel()
        viewModel.requestCode()
        viewModel.onCodeChange("123456")

        viewModel.onCodeChange("1")

        assertEquals(SignInState.CodeEntry(EMAIL, "1", SignInError.InvalidCode), viewModel.state.value)
    }

    @Test
    fun F001N_AC3_typingTheCodeKeepsTheLostConnectionAndRetryUntilTheNextAttempt() {
        api.answerAccepted()
        api.tokenAnswers += { throw IOException("offline") }
        api.answerToken()
        val viewModel = viewModel()
        viewModel.requestCode()
        viewModel.onCodeChange("123456")

        viewModel.onCodeChange("12345")

        assertEquals(SignInState.CodeEntry(EMAIL, "12345", SignInError.NoConnection), viewModel.state.value)
        viewModel.onCodeChange("123456")
        assertEquals(listOf("123456", "123456"), api.exchanges.map { it.code })
    }

    @Test
    fun F001N_AC3_onlyAsciiDigitsAreAccepted() {
        api.answerAccepted()
        val viewModel = viewModel()
        viewModel.requestCode()

        // Arabic-Indic and fullwidth digits are digits to Unicode, but the API takes 0 to 9 only.
        viewModel.onCodeChange("\u0661\u0662\u0663\u0664\u0665\u0666")
        assertEquals(SignInState.CodeEntry(EMAIL), viewModel.state.value)
        viewModel.onCodeChange("1\uFF12\u0663 4")

        assertEquals(SignInState.CodeEntry(EMAIL, "14"), viewModel.state.value)
        assertEquals(emptyList<SignInTokenRequest>(), api.exchanges)
    }

    @Test
    fun F001N_AC6_anotherTryAfterARefusedCode() {
        api.answerAccepted()
        api.answerCodeRefused()
        api.answerToken("token-2")
        val viewModel = viewModel()
        viewModel.requestCode()
        viewModel.onCodeChange("111111")

        viewModel.onCodeChange("222222")

        assertEquals(listOf("111111", "222222"), api.exchanges.map { it.code })
        assertEquals("token-2", store.read())
    }

    @Test
    fun F001N_AC3_offlineKeepsTheCodeAndTheSubmitButtonRetries() {
        api.answerAccepted()
        api.tokenAnswers += { throw IOException("offline") }
        api.answerToken()
        val viewModel = viewModel()
        viewModel.requestCode()
        viewModel.onCodeChange("123456")
        assertEquals(SignInState.CodeEntry(EMAIL, "123456", SignInError.NoConnection), viewModel.state.value)

        viewModel.submitCode()

        assertEquals(2, api.exchanges.size)
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC11_aStoreThatFailsShowsTheGenericErrorAndStaysSignedOut() {
        val failing = object : SessionStore {
            override fun read(): String? = null

            override fun save(token: String) = throw IOException("disk full")

            override fun delete() = Unit
        }
        val failingSession = Session(failing)
        api.answerAccepted()
        api.answerToken("token-1")
        val viewModel = viewModel(failingSession)
        viewModel.requestCode()

        viewModel.onCodeChange("123456")

        assertEquals(SignInState.CodeEntry(EMAIL, "123456", SignInError.Generic), viewModel.state.value)
        assertEquals(false, failingSession.state.value.signedIn)
    }

    @Test
    fun F001N_AC3_submitNeedsSixDigits() {
        api.answerAccepted()
        val viewModel = viewModel()
        viewModel.requestCode()
        viewModel.onCodeChange("123")

        viewModel.submitCode()

        assertEquals(emptyList<SignInTokenRequest>(), api.exchanges)
    }

    // Asks for the first email, so the code step is open.
    private fun SignInViewModel.reachTheCodeStep() {
        api.answerAccepted()
        requestCode()
    }

    @Test
    fun F001N_AC6_resendRequestsNewEmail() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        api.answerAccepted()

        viewModel.resendCode()

        assertEquals(List(2) { SignInRequest(EMAIL, language.apiLocale) }, api.requests)
        assertEquals(SignInState.CodeEntry(EMAIL, resent = true), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendingUntilTheApiAnswers() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.onCodeChange("123")
        val answer = CompletableDeferred<Response<Unit>>()
        api.requestAnswers += { answer.await() }

        viewModel.resendCode()
        assertEquals(SignInState.Resending(EMAIL, "123"), viewModel.state.value)

        answer.complete(Response.success(202, Unit))
        assertEquals(SignInState.CodeEntry(EMAIL, resent = true), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendAfterAWrongCodeLeavesTheFieldReady() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        api.answerCodeRefused()
        viewModel.onCodeChange("123456")
        api.answerAccepted()

        viewModel.resendCode()

        assertEquals(SignInState.CodeEntry(EMAIL, "", null, resent = true), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendFailureShowsTheMessageAndStaysOnTheCodeStep() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.onCodeChange("123")
        api.requestAnswers += { Response.error(500, "{}".toResponseBody()) }

        viewModel.resendCode()

        assertEquals(SignInState.CodeEntry(EMAIL, "123", SignInError.Generic), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendNoticeGoesWithTheNextAttempt() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        api.answerAccepted()
        viewModel.resendCode()
        api.answerCodeRefused()

        viewModel.onCodeChange("123456")

        assertEquals(SignInState.CodeEntry(EMAIL, "", SignInError.InvalidCode), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendNoticeStaysWhileTheCodeIsTyped() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        api.answerAccepted()
        viewModel.resendCode()

        viewModel.onCodeChange("12")

        assertEquals(SignInState.CodeEntry(EMAIL, "12", resent = true), viewModel.state.value)
    }

    @Test
    fun F001N_AC6_resendOnlyFromTheCodeStep() {
        val viewModel = viewModel()

        viewModel.resendCode()

        assertEquals(emptyList<SignInRequest>(), api.requests)
    }

    @Test
    fun F001N_AC1_changeAddressKeepsTheAddress() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.onCodeChange("123")

        viewModel.changeEmail()

        assertEquals(SignInState.EmailEntry(EMAIL), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_changeAddressThenARequestForTheNewAddress() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.changeEmail()
        api.answerAccepted()

        viewModel.onEmailChange("other@example.com")
        viewModel.sendCode()

        assertEquals(listOf(EMAIL, "other@example.com"), api.requests.map { it.email })
        assertEquals(SignInState.CodeEntry("other@example.com"), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_changeAddressOnlyFromTheCodeStep() {
        val viewModel = viewModel()
        viewModel.onEmailChange("typed@example.com")

        viewModel.changeEmail()

        assertEquals(SignInState.EmailEntry("typed@example.com"), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_lostConnectionOffersRetryOnTheEmailStep() {
        api.requestAnswers += { throw IOException("offline") }
        api.answerAccepted()
        val viewModel = viewModel()
        viewModel.requestCode()
        assertEquals(SignInState.EmailEntry(EMAIL, SignInError.NoConnection), viewModel.state.value)

        viewModel.retry()

        assertEquals(2, api.requests.size)
        assertEquals(SignInState.CodeEntry(EMAIL), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_lostConnectionOffersRetryOnTheCodeStep() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        api.tokenAnswers += { throw IOException("offline") }
        api.answerToken("token-3")
        viewModel.onCodeChange("123456")
        assertEquals(SignInState.CodeEntry(EMAIL, "123456", SignInError.NoConnection), viewModel.state.value)

        viewModel.retry()

        assertEquals(listOf("123456", "123456"), api.exchanges.map { it.code })
        assertEquals("token-3", store.read())
    }

    @Test
    fun F001N_AC1_lostConnectionOnAResendRetriesTheResend() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.onCodeChange("123")
        api.requestAnswers += { throw IOException("offline") }
        api.answerAccepted()
        viewModel.resendCode()
        assertEquals(SignInState.CodeEntry(EMAIL, "123", SignInError.NoConnection), viewModel.state.value)

        viewModel.retry()

        assertEquals(3, api.requests.size)
        assertEquals(emptyList<SignInTokenRequest>(), api.exchanges)
        assertEquals(SignInState.CodeEntry(EMAIL, resent = true), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_otherFailuresOfferNoRetry() {
        api.requestAnswers += { Response.error(500, "{}".toResponseBody()) }
        val viewModel = viewModel()
        viewModel.requestCode()

        viewModel.retry()

        assertEquals(1, api.requests.size)
        assertEquals(SignInState.EmailEntry(EMAIL, SignInError.Generic), viewModel.state.value)
    }

    @Test
    fun F001N_AC1_changeAddressForgetsTheLostConnection() {
        val viewModel = viewModel()
        viewModel.reachTheCodeStep()
        viewModel.onCodeChange("123")
        api.requestAnswers += { throw IOException("offline") }
        viewModel.resendCode()
        viewModel.changeEmail()

        viewModel.retry()

        assertEquals(2, api.requests.size)
        assertEquals(SignInState.EmailEntry(EMAIL), viewModel.state.value)
    }

    companion object {
        private const val EMAIL = "owner@example.com"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
