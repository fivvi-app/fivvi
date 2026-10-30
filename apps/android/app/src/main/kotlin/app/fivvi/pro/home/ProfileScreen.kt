package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.LanguageList
import app.fivvi.pro.R

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ProfileTags {
    const val TITLE = "profile.title"
    const val WORKSPACES_TITLE = "profile.workspacesTitle"
    const val LOADING = "profile.loading"
    const val ERROR = "profile.error"
    const val RETRY = "profile.retry"

    /** The language section: `profile.language` is its title, `profile.language.nl-NL` and `.en` the options. */
    const val LANGUAGE = "profile.language"
    const val LANGUAGE_ERROR = "profile.language.error"

    /** Row tags end in the workspace's slug: `profile.workspaceName.<slug>` and `profile.workspaceRole.<slug>`. */
    const val WORKSPACE_NAME = "profile.workspaceName"
    const val WORKSPACE_ROLE = "profile.workspaceRole"
}

/**
 * *Profiel* / *Profile* (TM-04, F003 AC9): the section *Mijn werkruimtes* / *My workspaces* lists each workspace with the
 * role label of the account on its team. Back is the system's back. No switching (F012); F005 adds name and email; F010 adds *Taal* (the language list, saved on the account).
 */
@Composable
fun ProfileScreen(
    state: ProfileState,
    onRetry: () -> Unit,
    language: AppLanguage,
    languageSaveFailed: Boolean,
    onChooseLanguage: (AppLanguage) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Text(
            text = stringResource(R.string.my_profile_title),
            modifier = Modifier.testTag(ProfileTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        Text(
            text = stringResource(R.string.my_profile_workspaces_title),
            modifier = Modifier.testTag(ProfileTags.WORKSPACES_TITLE).semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        when (state) {
            ProfileState.Loading -> {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally).testTag(ProfileTags.LOADING)
                        .semantics { contentDescription = label },
                )
            }

            is ProfileState.Loaded -> state.workspaces.forEach { Workspace(it) }

            ProfileState.Failed -> {
                Text(
                    text = stringResource(R.string.sign_in_errors_generic),
                    modifier = Modifier.testTag(ProfileTags.ERROR),
                    style = MaterialTheme.typography.body,
                )
                Button(onClick = onRetry, modifier = Modifier.testTag(ProfileTags.RETRY)) {
                    Text(stringResource(R.string.common_retry))
                }
            }
        }
        Text(
            text = stringResource(R.string.profile_language),
            modifier = Modifier.testTag(ProfileTags.LANGUAGE).semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        LanguageList(ProfileTags.LANGUAGE, language, onChooseLanguage)
        if (languageSaveFailed) {
            Text(
                text = stringResource(R.string.user_menu_error),
                modifier = Modifier.testTag(ProfileTags.LANGUAGE_ERROR),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

@Composable
private fun Workspace(workspace: ProfileWorkspace) {
    val role = stringResource(
        when (workspace.role) {
            ProfileRole.Owner -> R.string.roles_owner
            ProfileRole.Trainer -> R.string.roles_trainer
        },
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        Text(
            text = workspace.name,
            modifier = Modifier.testTag("${ProfileTags.WORKSPACE_NAME}.${workspace.slug}"),
            style = MaterialTheme.typography.body,
        )
        Text(
            text = role,
            modifier = Modifier.testTag("${ProfileTags.WORKSPACE_ROLE}.${workspace.slug}"),
            style = MaterialTheme.typography.body,
        )
    }
}
