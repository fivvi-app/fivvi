package app.fivvi.pro.home

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.MeResponse
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.auth.ApiServices
import app.fivvi.core.auth.FakeNetwork
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.core.signin.SignInTags
import app.fivvi.pro.AppRule
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

// A stored token opens the home, which calls the account through the generated client.
@RunWith(Parameterized::class)
class HomeScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val signIn = FakeSignInApi()
    private val store = InMemorySessionStore("token-1")

    private fun launch() = app.launch(
        device = listOf(language.tag),
        signInApi = signIn,
        meApi = me,
        session = Session(store),
    )

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    // The sign-out ends off the main thread (the token is deleted), so wait for TM-01.
    private fun waitForSignIn() = compose.waitUntilTagExists(SignInTags.EMAIL)

    @Test
    fun F001N_AC4_storedTokenOpensHomeWithTheAccountsAddress() {
        me.answerAccount("owner@example.com")
        launch()

        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(localizedString(language, R.string.home_signed_in_as, "owner@example.com"))
        assertEquals(1, me.calls)
    }

    @Test
    fun test_F002_AC10_homeStateFromMe_workspace() {
        me.answerAccount(workspaces = listOf("John's Gym"))
        launch()

        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertTextEquals("John's Gym")
        compose.onNodeWithTag(HomeTags.SET_UP_ON_WEB).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.NO_ACCESS).assertDoesNotExist()
    }

    @Test
    fun test_F002_AC10_homeStateFromMe_setUpOnTheWeb() {
        me.answerAccount(workspaces = emptyList(), canCreateWorkspace = true)
        launch()

        compose.onNodeWithTag(HomeTags.SET_UP_ON_WEB).assertTextEquals(string(R.string.home_set_up_on_web))
        compose.onNodeWithTag(HomeTags.OPEN_WEB).assertTextEquals(string(R.string.home_open_web))
        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.NO_ACCESS).assertDoesNotExist()
    }

    @Test
    fun test_F002_AC10_homeStateFromMe_noAccess() {
        me.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        launch()

        compose.onNodeWithTag(HomeTags.NO_ACCESS).assertIsDisplayed()
        compose.onNodeWithText(string(R.string.no_access_title)).assertIsDisplayed()
        compose.onNodeWithText(string(R.string.no_access_body)).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(string(R.string.sign_out_label))
        compose.onNodeWithTag(HomeTags.SET_UP_ON_WEB).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertDoesNotExist()
    }

    // F030 AC9: Mark signs in with an account that has no team role. He sees the no-access state with the line that points
    // him to the Fivvi app, in the language shown, and no workspace data.
    @Test
    fun test_F030_AC9_clientInFivviProIsPointedToFivvi() {
        me.answerAccount("mark@example.com", workspaces = emptyList(), canCreateWorkspace = false)
        launch()

        val hint = when (language) {
            AppLanguage.DUTCH -> "Ben je klant? Gebruik de app Fivvi."
            else -> "Are you a client? Use the Fivvi app."
        }
        compose.onNodeWithTag(HomeTags.NO_ACCESS_CLIENT_HINT).assertIsDisplayed().assertTextEquals(hint)
        compose.onNodeWithTag(HomeTags.NO_ACCESS_CLIENT_HINT).assertTextEquals(string(R.string.no_access_client_hint))
        compose.onNodeWithText(string(R.string.no_access_body)).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.SET_UP_ON_WEB).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).assertDoesNotExist()
        compose.onNodeWithTag(HomeTags.NEW).assertDoesNotExist()
    }

    // AC9: an account with a team role gets Home as before, without the line.
    @Test
    fun test_F030_AC9_aTeamMemberDoesNotSeeTheClientHint() {
        me.answerAccount(workspaces = listOf("John's Gym"))
        launch()

        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertTextEquals("John's Gym")
        compose.onNodeWithTag(HomeTags.NO_ACCESS_CLIENT_HINT).assertDoesNotExist()
    }

    @Test
    fun test_F002_AC10_noAccessSignOutShowsSignIn() {
        me.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        signIn.answerSignedOut()
        launch()

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        waitForSignIn()
        assertEquals(1, signIn.signOuts)
        assertNull(store.read())
    }

    @Test
    fun F001N_AC4_failedAccountCallShowsRetry() {
        me.answers += { throw IOException("offline") }
        me.answerAccount("owner@example.com")
        launch()

        compose.onNodeWithTag(HomeTags.ERROR)
            .assertTextEquals(localizedString(language, R.string.sign_in_errors_generic))
        compose.onNodeWithTag(HomeTags.RETRY)
            .assertTextEquals(localizedString(language, R.string.common_retry))
            .assertHasClickAction()
            .performClick()

        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(localizedString(language, R.string.home_signed_in_as, "owner@example.com"))
    }

    // The Hello screen's loading and heading proofs (E008 AC5 and AC7), on the home that replaced it (E020, #652).
    @Test
    fun E008_AC5_loadingIndicatorHasLabel() {
        val never = CompletableDeferred<Response<MeResponse>>()
        me.answers += { never.await() }
        launch()

        compose.onNodeWithTag(HomeTags.LOADING).assertContentDescriptionEquals(string(R.string.common_loading))
    }

    @Test
    fun E008_AC7_workspaceNameIsHeading() {
        me.answerAccount(workspaces = listOf("John's Gym"))
        launch()

        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME)
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
    }

    @Test
    fun F001N_AC9_aSessionThatEndsGoesBackToSignIn() {
        // What the auth layer does on a 401 (AuthInterceptorTest); the screen follows the session.
        me.answerAccount()
        val session = Session(store)
        app.launch(device = listOf(language.tag), meApi = me, session = session)
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS).assertIsDisplayed()

        session.expire("token-1")

        compose.onNodeWithTag(SignInTags.EMAIL).assertIsDisplayed()
        compose.onNodeWithTag(SignInTags.NOTICE).assertTextEquals(string(R.string.sign_in_signed_out_notice))
        assertNull(store.read())
    }

    @Test
    fun F001N_AC9_unauthorizedDeletesTokenAndShowsNotice() {
        // The whole chain: the generated client, the auth layer and a network that answers 401 to the account call.
        val network = FakeNetwork(status = 401)
        val session = Session(store)
        val services = ApiServices("https://example.com/api/", session, network)
        app.launch(device = listOf(language.tag), meApi = services.meApi, session = session)

        waitForSignIn()

        assertEquals("Bearer token-1", network.sent.single().header("Authorization"))
        compose.onNodeWithTag(SignInTags.NOTICE).assertTextEquals(string(R.string.sign_in_signed_out_notice))
        assertNull(store.read())
    }

    @Test
    fun F001N_AC10_signOutShowsSignIn() {
        me.answerAccount()
        signIn.answerSignedOut()
        launch()
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(string(R.string.sign_out_label))

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        waitForSignIn()
        assertEquals(1, signIn.signOuts)
        assertNull(store.read())
        compose.onNodeWithTag(SignInTags.NOTICE).assertDoesNotExist()
    }

    @Test
    fun F001N_AC10_signOutSendsTheTokenThenShowsSignIn() {
        // The whole chain: the generated client sends the sign-out with the token that was stored, which is deleted.
        me.answerAccount()
        val network = FakeNetwork(status = 204)
        val session = Session(store)
        val services = ApiServices("https://example.com/api/", session, network)
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            session = session,
            signOutApi = services::signOutApi,
        )

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        waitForSignIn()
        val request = network.sent.single()
        assertEquals("https://example.com/api/v1/sign-out", request.url.toString())
        assertEquals("Bearer token-1", request.header("Authorization"))
        assertNull(store.read())
    }

    @Test
    fun F001N_AC10_signOutOfflineStillShowsSignIn() {
        me.answerAccount()
        signIn.signOutAnswers += { throw IOException("offline") }
        launch()

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        waitForSignIn()
        assertNull(store.read())
        compose.onNodeWithTag(SignInTags.NOTICE).assertDoesNotExist()
    }

    @Test
    fun F001N_AC10_signOutRefusedByTheApiShowsTheNotice() {
        me.answerAccount()
        signIn.signOutAnswers += { Response.error(401, "{}".toResponseBody()) }
        launch()

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        waitForSignIn()
        compose.onNodeWithTag(SignInTags.NOTICE).assertTextEquals(string(R.string.sign_in_signed_out_notice))
    }

    @Test
    fun F001N_AC10_signingOutIsShownAndLabelled() {
        me.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signIn.signOutAnswers += { answer.await() }
        launch()

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performClick()

        compose.onNodeWithTag(HomeTags.SIGNING_OUT).assertContentDescriptionEquals(string(R.string.common_loading))
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertDoesNotExist()
        answer.complete(Response.success(204, Unit))
        waitForSignIn()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
