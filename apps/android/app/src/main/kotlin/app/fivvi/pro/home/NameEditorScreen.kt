package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.headline
import app.fivvi.pro.R

/**
 * The full-screen dialog that changes the person's name (TM-04): *Annuleren* and *Opslaan* in the bar on top, so the
 * keyboard never covers them, and the field below. Nothing is checked here: the API's refusal words the field message, and
 * a failed save leaves what was typed.
 */
@Composable
fun NameEditorScreen(editor: NameEditor, actions: ProfileActions, modifier: Modifier = Modifier) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space4),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(
                onClick = actions.onCancelName,
                enabled = !editor.saving,
                modifier = Modifier.testTag(ProfileTags.NAME_CANCEL),
            ) {
                Text(stringResource(R.string.common_cancel))
            }
            Text(
                text = stringResource(R.string.my_profile_edit_name),
                modifier = Modifier.weight(1f, fill = false).testTag(ProfileTags.NAME_EDITOR).semantics { heading() },
                style = MaterialTheme.typography.headline,
            )
            TextButton(
                onClick = actions.onSaveName,
                enabled = !editor.saving,
                modifier = Modifier.testTag(ProfileTags.NAME_SAVE),
            ) {
                Text(stringResource(R.string.my_profile_save))
            }
        }
        val error = editor.error
        OutlinedTextField(
            value = editor.input,
            onValueChange = actions.onNameInput,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.space2)
                .focusRequester(focus)
                .semantics { contentType = ContentType.PersonFullName }
                .testTag(ProfileTags.NAME_INPUT),
            enabled = !editor.saving,
            label = { Text(stringResource(R.string.my_profile_name_label)) },
            singleLine = true,
            isError = error != null,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { actions.onSaveName() }),
        )
        // Under the field, not as its supporting text: a field merges what it contains, and the message needs its own tag.
        if (error != null) {
            Text(
                text = stringResource(error.message),
                modifier = Modifier.padding(horizontal = Spacing.space2).testTag(ProfileTags.NAME_ERROR)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

private val NameError.message: Int
    get() = when (this) {
        NameError.Required -> R.string.my_profile_errors_name_required
        NameError.TooLong -> R.string.my_profile_errors_name_too_long
        NameError.NoConnection -> R.string.my_profile_errors_no_connection
        NameError.Failed -> R.string.my_profile_errors_generic
    }
