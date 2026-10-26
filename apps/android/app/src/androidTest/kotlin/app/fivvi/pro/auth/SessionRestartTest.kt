package app.fivvi.pro.auth

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ApplicationProvider
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.signin.FakeSignInApi
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

// AC8 (spec #168): the app opens signed in after it was closed and opened again, or the phone restarted, with the token
// in the Keystore-backed store: a new Session reads it, as a new process does.
class SessionRestartTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val signIn = FakeSignInApi()
    private val me = FakeMeApi()

    @Before
    fun setUp() = KeystoreSessionStore(context).delete()

    @After
    fun tearDown() = KeystoreSessionStore(context).delete()

    private fun launch() = app.launch(
        FakeHelloApi().apply { answerGreeting() },
        device = listOf(AppLanguage.ENGLISH.tag),
        signInApi = signIn,
        meApi = me,
        session = Session(KeystoreSessionStore(context)),
    )

    @Test
    fun F001N_AC8_aRestartKeepsTheSignIn() {
        KeystoreSessionStore(context).save("token-1")
        me.answerAccount("owner@example.com")
        launch()
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS).assertIsDisplayed()

        // The app is closed and the process is gone: a new session, a new activity.
        app.close()
        me.answerAccount("owner@example.com")
        launch()

        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(AppLanguage.ENGLISH, R.string.home_signed_in_as, "owner@example.com"))
        assertEquals(0, signIn.requests.size)
        assertEquals("token-1", KeystoreSessionStore(context).read())
    }
}
