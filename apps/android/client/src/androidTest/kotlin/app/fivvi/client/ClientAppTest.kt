package app.fivvi.client

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.client.shell.BookTags
import app.fivvi.client.shell.HomeTags
import app.fivvi.client.shell.ProfileTags
import app.fivvi.client.shell.ShellTags
import app.fivvi.client.shell.Tab
import app.fivvi.core.AppLanguage
import app.fivvi.core.InMemoryLanguageStore
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.core.signin.SignInTags
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

// Synthetic people (AGENTS.md, D8): Anna de Vries (anna@example.com) has an account and no workspace; Sarah
// (trainer@example.com) is a Trainer of John's Gym with no client relationship.
private const val ANNA = "anna@example.com"
private const val SARAH = "trainer@example.com"
private const val CODE = "123456"

// E017 (#504) through the real activity, in the language of the phone: sign-in, the tabs, Profiel, sign-out, the offline banner.
@RunWith(Parameterized::class)
class ClientAppTest(@Suppress("UNUSED_PARAMETER") tag: String, private val phone: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = ClientAppRule()

    private val other = AppLanguage.entries.first { it != phone }
    private val me = FakeMeApi()

    private fun string(language: AppLanguage, id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun press(tag: String) {
        compose.onNodeWithTag(tag).assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)
    }

    private fun signInWithTheCode(session: Session, signIn: FakeSignInApi) {
        signIn.answerAccepted()
        signIn.answerToken("token-1")
        app.launch(device = listOf(phone.tag), signInApi = signIn, meApi = me, session = session)
        compose.waitUntilTagExists(SignInTags.EMAIL)
        compose.onNodeWithTag(SignInTags.EMAIL).performTextInput(ANNA)
        press(SignInTags.SEND)
        compose.waitUntilTagExists(SignInTags.CODE)
        // Six digits check at once.
        compose.onNodeWithTag(SignInTags.CODE).performTextInput(CODE)
        compose.waitUntilTagExists(ShellTags.TABS)
    }

    private fun assertNoWorkspaceText(tags: app.fivvi.client.shell.NoWorkspaceTags, teamHint: Boolean) {
        compose.waitUntilTagExists(tags.title)
        compose.onNodeWithTag(tags.title).assertTextEquals(string(phone, R.string.no_workspace_title))
        compose.onNodeWithTag(tags.haveLink).assertTextEquals(string(phone, R.string.no_workspace_have_link))
        if (teamHint) {
            compose.onNodeWithTag(tags.teamHint).assertTextEquals(string(phone, R.string.no_workspace_team_hint))
        } else {
            compose.onNodeWithTag(tags.teamHint).assertDoesNotExist()
        }
    }

    @Test
    fun E017_AC1_theSignInScreenShowsTheNameFivvi() {
        app.launch(device = listOf(phone.tag), session = Session(InMemorySessionStore()))

        compose.waitUntilTagExists(SignInTags.APP_NAME)
        compose.onNodeWithTag(SignInTags.APP_NAME).assertTextEquals(string(phone, R.string.app_title))
        assertEquals("Fivvi", string(phone, R.string.app_title))
    }

    @Test
    fun E017_AC1_signingInWithTheCodeShowsTheThreeTabsAndTheNoWorkspaceText() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        val store = InMemorySessionStore()

        signInWithTheCode(Session(store), FakeSignInApi())

        assertEquals("token-1", store.read())
        Tab.entries.forEach {
            compose.onNodeWithTag(it.tag).assertTextEquals(string(phone, it.label))
        }
        compose.onNodeWithTag(Tab.HOME.tag).assertIsSelected()
        assertNoWorkspaceText(HomeTags, teamHint = false)
    }

    @Test
    fun E017_AC1_boekenShowsTheSameNoWorkspaceText() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        app.launch(device = listOf(phone.tag), meApi = me)
        compose.waitUntilTagExists(HomeTags.title)

        compose.onNodeWithTag(Tab.BOOK.tag).performClick()

        compose.onNodeWithTag(Tab.BOOK.tag).assertIsSelected()
        assertNoWorkspaceText(BookTags, teamHint = false)
    }

    @Test
    fun E017_AC3_aTrainerIsPointedToFivviProAndSeesNoTeamData() {
        me.answerAccount(
            email = SARAH,
            name = "Sarah",
            workspaces = listOf("John's Gym"),
            role = MeWorkspace.Role.TRAINER,
        )
        app.launch(device = listOf(phone.tag), meApi = me)

        assertNoWorkspaceText(HomeTags, teamHint = true)
        compose.onNodeWithTag(Tab.BOOK.tag).performClick()
        assertNoWorkspaceText(BookTags, teamHint = true)
        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()
        compose.waitUntilTagExists(ProfileTags.EMAIL)
        compose.onAllNodesWithText("John's Gym", substring = true).assertCountEquals(0)
    }

    @Test
    fun E017_AC1_profielShowsTheNameTheEmailAddressAndTheVersion() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        app.launch(device = listOf(phone.tag), meApi = me)

        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()

        compose.waitUntilTagExists(ProfileTags.EMAIL)
        compose.onNodeWithTag(ProfileTags.NAME).assertTextEquals("Anna de Vries")
        compose.onNodeWithTag(ProfileTags.EMAIL).assertTextEquals(ANNA)
        compose.onNodeWithTag(ProfileTags.VERSION)
            .assertTextEquals(string(phone, R.string.profile_version, BuildConfig.VERSION_NAME))
        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${phone.tag}").assertIsSelected()
    }

    @Test
    fun E017_AC2_switchingTaalChangesTheWholeAppAtOnceAndSavesItOnTheAccount() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        app.launch(device = listOf(phone.tag), meApi = me)
        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()
        compose.waitUntilTagExists(ProfileTags.EMAIL)

        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").performClick()

        compose.waitUntil(UI_TIMEOUT_MILLIS) { me.updates.isNotEmpty() }
        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").assertIsSelected()
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).assertTextEquals(string(other, R.string.sign_out_label))
        compose.onNodeWithTag(ProfileTags.VERSION)
            .assertTextEquals(string(other, R.string.profile_version, BuildConfig.VERSION_NAME))
        Tab.entries.forEach { compose.onNodeWithTag(it.tag).assertTextEquals(string(other, it.label)) }
        compose.onNodeWithTag(Tab.HOME.tag).performClick()
        compose.onNodeWithTag(HomeTags.title).assertTextEquals(string(other, R.string.no_workspace_title))
        assertEquals(
            listOf(
                UpdateMeRequest(
                    preferredLocale = if (other == AppLanguage.DUTCH) {
                        UpdateMeRequest.PreferredLocale.NL_NL
                    } else {
                        UpdateMeRequest.PreferredLocale.EN
                    },
                    surface = UpdateMeRequest.Surface.ANDROID,
                ),
            ),
            me.updates,
        )
    }

    // F010 AC3: a foreground read that left before the choice and answers with the old language must not undo the choice.
    @Test
    fun E017_AC2_aChoiceMadeWhileAForegroundReadIsPendingIsKept() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        app.launch(device = listOf(phone.tag), meApi = me)
        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()
        compose.waitUntilTagExists(ProfileTags.EMAIL)
        // The foreground reads (the account's and the language's) wait for this; both answer with the phone's language.
        val answered = CompletableDeferred<Unit>()
        val finished = AtomicInteger()
        repeat(2) {
            me.answers += {
                answered.await()
                finished.incrementAndGet()
                Response.success(account(phone))
            }
        }
        app.backgroundAndForeground()
        compose.waitUntil(UI_TIMEOUT_MILLIS) { me.calls >= 3 }

        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").performClick()
        compose.waitUntil(UI_TIMEOUT_MILLIS) { me.updates.isNotEmpty() }
        answered.complete(Unit)
        // Every foreground read that started has answered.
        compose.waitUntil(UI_TIMEOUT_MILLIS) { finished.get() == me.calls - 1 }
        compose.waitForIdle()

        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").assertIsSelected()
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).assertTextEquals(string(other, R.string.sign_out_label))
    }

    // F010 AC3: Taal is offered once the account has loaded, so no choice can be made while the opening read is out: its
    // answer, taken as the stored language, would undo a choice whose PATCH answered first.
    @Test
    fun E017_AC2_taalIsOfferedOnlyOnceTheAccountHasLoaded() {
        val answered = CompletableDeferred<Unit>()
        me.answers += {
            answered.await()
            Response.success(account(phone))
        }
        app.launch(device = listOf(phone.tag), meApi = me)
        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()
        compose.waitUntilTagExists(ProfileTags.LOADING)

        AppLanguage.entries.forEach { compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${it.tag}").assertDoesNotExist() }
        compose.onNodeWithTag(ProfileTags.LANGUAGE).assertDoesNotExist()
        answered.complete(Unit)

        compose.waitUntilTagExists(ProfileTags.EMAIL)
        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${phone.tag}").assertIsSelected()
        compose.onNodeWithTag(ProfileTags.LANGUAGE).assertTextEquals(string(phone, R.string.profile_language))
    }

    private fun account(language: AppLanguage) = MeResponse(
        id = UUID.randomUUID(),
        email = ANNA,
        name = "Anna de Vries",
        preferredLocale = if (language == AppLanguage.DUTCH) {
            MeResponse.PreferredLocale.NL_NL
        } else {
            MeResponse.PreferredLocale.EN
        },
        bookingEmails = true,
        canCreateWorkspace = false,
        workspaces = emptyList(),
        clientWorkspaces = emptyList(),
    )

    @Test
    fun E017_AC2_uitloggenRemovesTheTokenAndReturnsToSignIn() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        val signIn = FakeSignInApi().apply { answerSignedOut() }
        val store = InMemorySessionStore("token-1")
        val sentWith = mutableListOf<String>()
        app.launch(
            device = listOf(phone.tag),
            signInApi = signIn,
            meApi = me,
            session = Session(store),
            signOutApi = { token ->
                sentWith += token
                signIn
            },
        )
        compose.onNodeWithTag(Tab.PROFILE.tag).performClick()
        compose.waitUntilTagExists(ProfileTags.SIGN_OUT)
        compose.onNodeWithTag(ProfileTags.SIGN_OUT).assertTextEquals(string(phone, R.string.sign_out_label))

        press(ProfileTags.SIGN_OUT)

        compose.waitUntilTagExists(SignInTags.EMAIL)
        assertNull(store.read())
        // The request that ends the session on the server carries the token it ended (a later call with it answers 401).
        assertEquals(listOf("token-1"), sentWith)
        assertEquals(1, signIn.signOuts)
        compose.onNodeWithTag(ShellTags.TABS).assertDoesNotExist()
    }

    @Test
    fun E017_AC9_offlineEveryTabShowsTheOfflineBanner() {
        me.answerAccount(email = ANNA, name = "Anna de Vries", workspaces = emptyList())
        val connectivity = FakeConnectivity(online = false)
        app.launch(device = listOf(phone.tag), meApi = me, connectivity = connectivity)

        Tab.entries.forEach { tab ->
            compose.onNodeWithTag(tab.tag).performClick()
            compose.waitUntilTagExists(ShellTags.OFFLINE)
            compose.onNodeWithTag(ShellTags.OFFLINE).assertTextEquals(string(phone, R.string.common_offline))
            compose.onNodeWithTag(ShellTags.OFFLINE).assertIsDisplayed()
        }
        connectivity.setOnline(true)
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(ShellTags.OFFLINE)).fetchSemanticsNodes().isEmpty()
        }
    }

    @Test
    fun E017_AC2_theStoredLanguageOfTheAccountIsAdoptedOnOpening() {
        me.answerAccount(
            email = ANNA,
            name = "Anna de Vries",
            workspaces = emptyList(),
            preferredLocale = if (other == AppLanguage.DUTCH) {
                MeResponse.PreferredLocale.NL_NL
            } else {
                MeResponse.PreferredLocale.EN
            },
        )

        app.launch(device = listOf(phone.tag), meApi = me, languageStore = InMemoryLanguageStore())

        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching {
                compose.onNodeWithTag(Tab.PROFILE.tag).assertTextEquals(string(other, Tab.PROFILE.label))
            }.isSuccess
        }
        assertEquals(emptyList<UpdateMeRequest>(), me.updates)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
