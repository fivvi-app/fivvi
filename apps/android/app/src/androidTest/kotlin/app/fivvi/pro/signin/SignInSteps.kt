package app.fivvi.pro.signin

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.home.HomeTags
import org.junit.Assert.assertEquals

/** What a person does on TM-01 in a launched app, shared by the sign-in UI tests. */
class SignInSteps(
    private val compose: ComposeTestRule,
    private val app: AppRule,
    private val signIn: FakeSignInApi,
    private val language: AppLanguage,
) {
    /**
     * Types the address and asks for the code: the email step through to the code step. Typing opens the soft keyboard,
     * whose inset animation moves the centred form, so a tap at a button's old position can miss it. Invoking the
     * button's click action has no position to miss, and still needs the button enabled.
     */
    fun requestTheCode(address: String = ADDRESS) {
        val requested = signIn.requests.size
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput(address)
        press(SignInTags.SEND)
        assertEquals(requested + 1, signIn.requests.size)
        compose.onNodeWithTag(SignInTags.CODE).assertIsDisplayed()
    }

    /** Taps the button with [tag] by invoking its click action (see [requestTheCode]). */
    fun press(tag: String) {
        compose.onNodeWithTag(tag).assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)
    }

    /** The sign-in finishes off the main thread (the token is stored), so wait for the home. */
    fun assertSignedInAs(address: String = ADDRESS) {
        compose.waitUntil(TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(HomeTags.SIGNED_IN_AS)).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(HomeTags.SIGNED_IN_AS)
            .assertTextEquals(app.string(language, R.string.home_signed_in_as, address))
    }

    companion object {
        const val ADDRESS = "owner@example.com"
        const val TIMEOUT_MILLIS = 5_000L
    }
}
