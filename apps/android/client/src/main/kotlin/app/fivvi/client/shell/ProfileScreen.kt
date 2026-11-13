package app.fivvi.client.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.client.account.AccountState
import app.fivvi.core.AppLanguage
import app.fivvi.core.LanguageList
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSizeLarge
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.PersonAvatar
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.ui.LoadError
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows (the ones of Fivvi Pro's Profiel). */
object ProfileTags {
    const val TITLE = "profile.title"
    const val LOADING = "profile.loading"
    const val ERROR = "profile.error"
    const val RETRY = "profile.retry"
    const val AVATAR = "profile.avatar"
    const val NAME = "profile.name"
    const val EMAIL = "profile.email"

    /** The language section: `profile.language` is its title, `profile.language.nl-NL` and `.en` the options. */
    const val LANGUAGE = "profile.language"
    const val LANGUAGE_ERROR = "profile.language.error"
    const val SIGN_OUT = "profile.signOut"
    const val SIGNING_OUT = "profile.signingOut"
    const val VERSION = "profile.version"
}

/** What the person can do on *Profiel*; the view models answer each. */
class ProfileActions(
    val onRetry: () -> Unit,
    val language: AppLanguage,
    val languageSaveFailed: Boolean,
    val onChooseLanguage: (AppLanguage) -> Unit,
    val onSignOut: () -> Unit,
    val signingOut: Boolean,
)

/**
 * *Profiel* / *Profile* in the v2 look (*Profiel en tegoed*): the large title, the avatar with the name and the email address
 * centred under it (read-only; editing is F033), *Taal* (Nederlands · English, saved on the account, F010; offered once the
 * account has loaded) as a grouped list, *Uitloggen* and the app's [version]. Scrolls, so text at the largest font scale wraps.
 */
@Composable
fun ProfileScreen(state: AccountState, actions: ProfileActions, version: String) {
    if (state == AccountState.Failed) {
        LoadError(R.string.sign_in_errors_generic, ProfileTags.ERROR, ProfileTags.RETRY, actions.onRetry)
        return
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.space4),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Text(
            text = stringResource(R.string.client_nav_profile),
            modifier = Modifier.padding(horizontal = Spacing.space1).testTag(ProfileTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        when (state) {
            is AccountState.Loaded -> Identity(state)
            else -> Loading()
        }
        // Taal is offered once the account has loaded (F010 AC3): the stored language of the opening read is adopted when it
        // answers, which would undo a choice made while it was out.
        if (state is AccountState.Loaded) {
            Text(
                text = stringResource(R.string.profile_language),
                modifier = Modifier.padding(start = Spacing.space4).testTag(ProfileTags.LANGUAGE)
                    .semantics { heading() },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            LanguageList(ProfileTags.LANGUAGE, actions.language, actions.onChooseLanguage)
        }
        if (actions.languageSaveFailed) {
            FieldErrorLine(
                message = stringResource(R.string.user_menu_error),
                modifier = Modifier.padding(horizontal = Spacing.space4).testTag(ProfileTags.LANGUAGE_ERROR),
            )
        }
        SignOutButton(actions)
        Text(
            text = stringResource(R.string.profile_version, version),
            modifier = Modifier.fillMaxWidth().testTag(ProfileTags.VERSION),
            style = MaterialTheme.typography.subhead,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

// The prototype's header: the large avatar, then the name and the email address, all centred. An account without a name shows
// only its address, and the avatar takes its letter.
@Composable
private fun Identity(state: AccountState.Loaded) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        PersonAvatar(state.name ?: state.email, Modifier.testTag(ProfileTags.AVATAR), AvatarSizeLarge)
        state.name?.let { name ->
            Text(
                text = name,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.space2).testTag(ProfileTags.NAME),
                style = MaterialTheme.typography.title2,
                textAlign = TextAlign.Center,
            )
        }
        Text(
            text = state.email,
            modifier = Modifier.fillMaxWidth().testTag(ProfileTags.EMAIL),
            style = MaterialTheme.typography.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun Loading() {
    val description = stringResource(R.string.common_loading)
    CircularProgressIndicator(
        Modifier.testTag(ProfileTags.LOADING).semantics {
            contentDescription = description
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
private fun ColumnScope.SignOutButton(actions: ProfileActions) {
    if (actions.signingOut) {
        val description = stringResource(R.string.common_loading)
        CircularProgressIndicator(
            Modifier.align(Alignment.CenterHorizontally).testTag(ProfileTags.SIGNING_OUT).semantics {
                contentDescription = description
                liveRegion = LiveRegionMode.Polite
            },
        )
        return
    }
    PillButton(
        text = stringResource(R.string.sign_out_label),
        onClick = actions.onSignOut,
        modifier = Modifier.fillMaxWidth().testTag(ProfileTags.SIGN_OUT),
        style = PillButtonStyle.Tonal,
    )
}
