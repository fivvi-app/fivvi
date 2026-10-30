package app.fivvi.pro

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.home.ProfileTags
import app.fivvi.pro.signin.FakeSignInApi
import app.fivvi.pro.signin.SignInSteps
import app.fivvi.pro.signin.SignInTags
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F010 (spec #175) on the real activity: the app starts in the language of the phone and switches without a restart.
@RunWith(Parameterized::class)
class LanguageSwitchTest(@Suppress("UNUSED_PARAMETER") tag: String, private val phone: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    // The greeting is asked again in the new language after a switch.
    private val hello = FakeHelloApi().apply {
        answerGreeting()
        answerGreeting()
    }
    private val me = FakeMeApi()
    private val other = AppLanguage.entries.first { it != phone }

    private fun string(language: AppLanguage, id: Int) = localizedString(language, id)

    private fun openProfile() {
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists(ProfileTags.LANGUAGE)
    }

    @Test
    fun test_F010_AC3_inAppSwitchRerendersAndSaves() {
        me.answerAccount()
        me.answerWorkspaces()
        app.launch(hello, device = listOf(phone.tag), meApi = me)
        openProfile()
        compose.onNodeWithTag(ProfileTags.LANGUAGE).assertTextEquals(string(phone, R.string.profile_language))
        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${phone.tag}").assertIsSelected()

        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").performClick()

        compose.waitUntil(UI_TIMEOUT_MILLIS) { me.updates.isNotEmpty() }
        compose.onNodeWithTag(ProfileTags.LANGUAGE).assertTextEquals(string(other, R.string.profile_language))
        compose.onNodeWithTag(ProfileTags.TITLE).assertTextEquals(string(other, R.string.my_profile_title))
        compose.onNodeWithTag("${ProfileTags.LANGUAGE}.${other.tag}").assertIsSelected()
        assertEquals(
            listOf(
                UpdateMeRequest(
                    if (other ==
                        AppLanguage.DUTCH
                    ) {
                        UpdateMeRequest.PreferredLocale.NL_NL
                    } else {
                        UpdateMeRequest.PreferredLocale.EN
                    },
                ),
            ),
            me.updates,
        )
    }

    @Test
    fun test_F010_AC2_adoptsStoredPreferenceOnForeground() {
        me.answerAccount()
        me.answerAccount(
            preferredLocale = if (other ==
                AppLanguage.DUTCH
            ) {
                MeResponse.PreferredLocale.NL_NL
            } else {
                MeResponse.PreferredLocale.EN
            },
        )
        app.launch(hello, device = listOf(phone.tag), meApi = me)
        compose.waitUntilTagExists(HomeTags.SIGN_OUT)
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(string(phone, R.string.sign_out_label))

        app.backgroundAndForeground()

        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching {
                compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(string(other, R.string.sign_out_label))
            }.isSuccess
        }
        assertEquals(emptyList<UpdateMeRequest>(), me.updates)
    }

    @Test
    fun test_F010_AC4_signedOutChoiceKeptLocally() {
        val signIn = FakeSignInApi()
        val store = InMemoryLanguageStore()
        app.launch(
            hello,
            device = listOf(phone.tag),
            signInApi = signIn,
            session = Session(InMemorySessionStore()),
            languageStore = store,
        )
        compose.waitUntilTagExists(SignInTags.LANGUAGE + "." + other.tag)
        compose.onNodeWithTag(SignInTags.SEND).assertTextEquals(string(phone, R.string.sign_in_send_code))

        compose.onNodeWithTag("${SignInTags.LANGUAGE}.${other.tag}").performClick()

        compose.onNodeWithTag(SignInTags.SEND).assertTextEquals(string(other, R.string.sign_in_send_code))
        compose.onNodeWithTag("${SignInTags.LANGUAGE}.${other.tag}").assertIsSelected()
        assertEquals(other, store.choice)
        signIn.answerAccepted()
        SignInSteps(compose, signIn, other).requestTheCode()
        assertEquals(other.apiLocale, signIn.requests.single().locale)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
