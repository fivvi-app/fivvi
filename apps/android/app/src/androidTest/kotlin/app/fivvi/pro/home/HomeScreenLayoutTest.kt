package app.fivvi.pro.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.then
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.assertButtonFits
import app.fivvi.pro.assertWraps
import app.fivvi.pro.hello.HelloState
import app.fivvi.pro.localizedString
import app.fivvi.pro.theme.FivviTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC15 (spec #168): the signed-in home at the largest font scale (200%) on a small phone, in each catalog language.
@RunWith(Parameterized::class)
class HomeScreenLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private fun show(me: MeState, signingOut: Boolean = false) = compose.setContent {
        DeviceConfigurationOverride(
            DeviceConfigurationOverride.FontScale(2f) then
                DeviceConfigurationOverride.Locales(LocaleList(language.tag)),
        ) {
            FivviTheme {
                Box(Modifier.width(320.dp).height(640.dp)) {
                    HomeScreen(
                        HelloState.Loaded(R.string.hello_title),
                        me,
                        signingOut,
                        onRetryHello = {},
                        onRetryMe = {},
                        onSignOut = {},
                    )
                }
            }
        }
    }

    @Test
    fun F001N_AC15_fontScale200Wraps() {
        show(MeState.Loaded("a.long.address.for.a.trainer@example.com"))

        compose.assertWraps(HomeTags.SIGNED_IN_AS, wraps = true)
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F001N_AC15_touchTargets() {
        show(MeState.Failed)

        compose.assertWraps(HomeTags.ERROR, wraps = true)
        compose.assertButtonFits(HomeTags.RETRY)
        compose.assertButtonFits(HomeTags.SIGN_OUT)
    }

    @Test
    fun F001N_AC15_theSignOutButtonIsLabelled() {
        show(MeState.Loaded("owner@example.com"))

        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(localizedString(language, R.string.sign_out_label))
    }

    @Test
    fun F001N_AC15_signingOutIsLabelledAndAnnounced() {
        show(MeState.Loaded("owner@example.com"), signingOut = true)

        compose.onNodeWithTag(HomeTags.SIGNING_OUT)
            .assert(hasContentDescription(localizedString(language, R.string.common_loading)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
