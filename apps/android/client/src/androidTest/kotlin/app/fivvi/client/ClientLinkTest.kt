package app.fivvi.client

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import app.fivvi.client.links.LinkTags
import app.fivvi.client.shell.HomeTags
import app.fivvi.client.shell.ShellTags
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.core.signin.SignInTags
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOIN_LINK = "https://fivvi.app/j/ABCD2345"
private const val INVITATION_LINK = "https://fivvi.app/i/tok-4f9x"

// E017 #506, AC6 through the real activity, in the language of the phone: Anna de Vries (anna@example.com, an account
// with no workspace) opens the join link of a studio from Mail or the camera.
@RunWith(Parameterized::class)
class ClientLinkTest(@Suppress("UNUSED_PARAMETER") tag: String, private val phone: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = ClientAppRule()

    private val me = FakeMeApi().apply {
        answerAccount(email = "anna@example.com", name = "Anna de Vries", workspaces = emptyList())
    }
    private val browser = FakeBrowser()

    private fun press(tag: String) {
        compose.onNodeWithTag(tag).assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)
    }

    private fun assertPlaceholder() {
        compose.waitUntilTagExists(LinkTags.SOON)
        compose.onNodeWithTag(LinkTags.SOON).assertTextEquals(localizedString(phone, R.string.app_link_soon))
        compose.onNodeWithTag(LinkTags.OPEN_IN_BROWSER)
            .assertTextEquals(localizedString(phone, R.string.app_link_open_in_browser))
        compose.onNodeWithTag(ShellTags.TABS).assertDoesNotExist()
    }

    @Test
    fun E017_AC6_openJoinLinkAfterSignIn() {
        val signIn = FakeSignInApi().apply {
            answerAccepted()
            answerToken("token-1")
        }
        app.launch(
            device = listOf(phone.tag),
            signInApi = signIn,
            meApi = me,
            session = Session(InMemorySessionStore()),
            browser = browser,
            link = JOIN_LINK,
        )

        // Signed out: sign-in first, not the placeholder.
        compose.waitUntilTagExists(SignInTags.EMAIL)
        compose.onNodeWithTag(LinkTags.SOON).assertDoesNotExist()
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput("anna@example.com")
        press(SignInTags.SEND)
        compose.waitUntilTagExists(SignInTags.CODE)
        compose.onNodeWithTag(SignInTags.CODE).performTextInput("123456")

        // Signed in: the placeholder, then the same address in the browser.
        assertPlaceholder()
        press(LinkTags.OPEN_IN_BROWSER)
        assertEquals(listOf(JOIN_LINK), browser.opened)
    }

    @Test
    fun E017_AC6_aSignedInPersonSeesThePlaceholderAtOnceAndBackReturnsToTheTabs() {
        app.launch(device = listOf(phone.tag), meApi = me, browser = browser, link = INVITATION_LINK)

        assertPlaceholder()
        press(LinkTags.OPEN_IN_BROWSER)
        assertEquals(listOf(INVITATION_LINK), browser.opened)

        press(LinkTags.BACK)

        compose.waitUntilTagExists(ShellTags.TABS)
        compose.onNodeWithTag(HomeTags.title).assertTextEquals(localizedString(phone, R.string.no_workspace_title))
        compose.onNodeWithTag(LinkTags.SOON).assertDoesNotExist()
    }

    @Test
    fun E017_AC6_aLinkTappedWhileTheAppIsOpenShowsThePlaceholder() {
        app.launch(device = listOf(phone.tag), meApi = me, browser = browser)
        compose.waitUntilTagExists(ShellTags.TABS)

        app.openLink(JOIN_LINK)

        assertPlaceholder()
    }

    @Test
    fun E017_AC6_anotherAddressOfTheSiteOpensTheTabsNotThePlaceholder() {
        app.launch(device = listOf(phone.tag), meApi = me, browser = browser, link = "https://fivvi.app/privacy")

        compose.waitUntilTagExists(ShellTags.TABS)
        compose.onNodeWithTag(LinkTags.SOON).assertDoesNotExist()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
