package app.fivvi.pro.signin

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.signin.SignInSteps.Companion.ADDRESS
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

// AC14 (spec #168): TM-01's language and the `locale` its request sends follow ADR-017, on a German-only phone and with
// a per-app language, through the real activity.
class SignInLanguageTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val signIn = FakeSignInApi()

    private fun launch(device: List<String>, perApp: List<String> = emptyList()) = app.launch(
        FakeHelloApi().apply { answerGreeting() },
        device = device,
        perApp = perApp,
        signInApi = signIn,
        session = Session(InMemorySessionStore()),
    )

    private fun requestTheCode(language: AppLanguage) {
        signIn.answerAccepted()
        SignInSteps(compose, signIn, language).requestTheCode()
    }

    @Test
    fun F001N_AC14_unsupportedDeviceLanguageRequestsEnglish() {
        launch(device = listOf("de-DE"))
        compose.onNodeWithTag(SignInTags.SEND)
            .assertTextEquals(localizedString(AppLanguage.ENGLISH, R.string.sign_in_send_code))

        requestTheCode(AppLanguage.ENGLISH)

        assertEquals(AppLanguage.ENGLISH.apiLocale, signIn.requests.single().locale)
        compose.onNodeWithTag(SignInTags.CHECK_EMAIL)
            .assertTextEquals(localizedString(AppLanguage.ENGLISH, R.string.sign_in_check_email_body_app, ADDRESS))
    }

    @Test
    fun F001N_AC14_perAppLanguageWins() {
        launch(device = listOf("de-DE"), perApp = listOf("nl"))
        compose.onNodeWithTag(SignInTags.SEND)
            .assertTextEquals(localizedString(AppLanguage.DUTCH, R.string.sign_in_send_code))

        requestTheCode(AppLanguage.DUTCH)

        assertEquals(AppLanguage.DUTCH.apiLocale, signIn.requests.single().locale)
        compose.onNodeWithTag(SignInTags.CHECK_EMAIL)
            .assertTextEquals(localizedString(AppLanguage.DUTCH, R.string.sign_in_check_email_body_app, ADDRESS))
    }

    @Test
    fun F001N_AC14_theResendUsesTheAppLanguageToo() {
        launch(device = listOf("de-DE"), perApp = listOf("nl"))
        requestTheCode(AppLanguage.DUTCH)
        signIn.answerAccepted()

        SignInSteps(compose, signIn, AppLanguage.DUTCH).press(SignInTags.RESEND)

        assertEquals(List(2) { AppLanguage.DUTCH.apiLocale }, signIn.requests.map { it.locale })
        compose.onNodeWithTag(SignInTags.RESENT)
            .assertTextEquals(localizedString(AppLanguage.DUTCH, R.string.sign_in_resent, ADDRESS))
    }
}
