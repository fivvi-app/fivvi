package app.fivvi.pro.signin

import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.assertButtonFits
import app.fivvi.pro.assertWraps
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC15 (spec #168): TM-01 at Android's largest font scale (200%) on a small phone (320 dp wide), and what a screen
// reader gets, in each catalog language.
@RunWith(Parameterized::class)
class SignInScreenLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val noActions = SignInActions({}, {}, {}, {}, {}, {}, {})

    private fun show(state: SignInState, showsSignedOutNotice: Boolean = false) =
        compose.showAtLargestFontScale(language, height = 640.dp) {
            SignInScreen(state, noActions, showsSignedOutNotice = showsSignedOutNotice)
        }

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    @Test
    fun F001N_AC15_fontScale200WrapsOnTheEmailStep() {
        show(SignInState.EmailEntry(ADDRESS, SignInError.NoConnection), showsSignedOutNotice = true)

        compose.assertWraps(SignInTags.TITLE)
        compose.assertWraps(SignInTags.NOTICE, wraps = true)
        compose.assertWraps(SignInTags.ERROR, wraps = true)
        compose.assertButtonFits(SignInTags.SEND)
        compose.assertButtonFits(SignInTags.RETRY)
    }

    @Test
    fun F001N_AC15_fontScale200WrapsOnTheCodeStep() {
        show(SignInState.CodeEntry(ADDRESS, "123", SignInError.InvalidCode, resent = true))

        compose.assertWraps(SignInTags.TITLE)
        compose.assertWraps(SignInTags.CHECK_EMAIL, wraps = true)
        compose.assertWraps(SignInTags.RESENT, wraps = true)
        compose.assertWraps(SignInTags.ERROR, wraps = true)
        compose.assertButtonFits(SignInTags.SUBMIT)
        compose.assertButtonFits(SignInTags.RESEND)
        compose.assertButtonFits(SignInTags.CHANGE_EMAIL)
    }

    @Test
    fun F001N_AC15_touchTargets() {
        show(SignInState.CodeEntry(ADDRESS, "123456", SignInError.NoConnection))

        listOf(SignInTags.SUBMIT, SignInTags.RESEND, SignInTags.CHANGE_EMAIL, SignInTags.RETRY).forEach {
            compose.assertButtonFits(it)
        }
    }

    @Test
    fun F001N_AC15_fieldsAreLabelled() {
        show(SignInState.EmailEntry())
        compose.onNodeWithTag(SignInTags.EMAIL).assertTextContains(string(R.string.sign_in_email_label))
    }

    @Test
    fun F001N_AC15_theCodeFieldIsLabelledAndHasItsHelp() {
        show(SignInState.CodeEntry(ADDRESS))

        compose.onNodeWithTag(SignInTags.CODE)
            .assertTextContains(string(R.string.sign_in_code_label))
            .assertTextContains(string(R.string.sign_in_code_help))
    }

    @Test
    fun F001N_AC15_loadingIsLabelledAndAnnounced() {
        show(SignInState.Checking(ADDRESS, "123456"))

        compose.onNodeWithTag(SignInTags.LOADING)
            .assert(hasContentDescription(string(R.string.common_loading)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun F001N_AC15_theSignedOutNoticeIsAnnounced() {
        show(SignInState.EmailEntry(), showsSignedOutNotice = true)

        compose.onNodeWithTag(SignInTags.NOTICE)
            .assert(hasText(string(R.string.sign_in_signed_out_notice)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun F001N_AC15_failuresAreAnnounced() {
        show(SignInState.CodeEntry(ADDRESS, error = SignInError.InvalidCode, resent = true))

        compose.onNodeWithTag(SignInTags.ERROR)
            .assert(hasText(string(R.string.sign_in_errors_invalid_or_expired_code)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        compose.onNodeWithTag(SignInTags.RESENT)
            .assert(hasText(string(R.string.sign_in_resent, ADDRESS)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun F001N_AC3_theCodeFieldAsksForOneTimeCodeAutofill() {
        show(SignInState.CodeEntry(ADDRESS))

        compose.onNodeWithTag(SignInTags.CODE)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentType, ContentType.SmsOtpCode))
    }

    companion object {
        private const val ADDRESS = "owner@example.com"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
