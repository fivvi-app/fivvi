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
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.core.R
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.FivviField
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.headline

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
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PillButton(
                text = stringResource(R.string.common_cancel),
                onClick = actions.onCancelName,
                modifier = Modifier.testTag(ProfileTags.NAME_CANCEL),
                style = PillButtonStyle.Text,
                enabled = !editor.saving,
            )
            Text(
                text = stringResource(R.string.my_profile_edit_name),
                modifier = Modifier.weight(1f).testTag(ProfileTags.NAME_EDITOR).semantics { heading() },
                style = MaterialTheme.typography.headline,
                textAlign = TextAlign.Center,
            )
            PillButton(
                text = stringResource(R.string.my_profile_save),
                onClick = actions.onSaveName,
                modifier = Modifier.testTag(ProfileTags.NAME_SAVE),
                enabled = !editor.saving,
            )
        }
        val error = editor.error
        val message = error?.let { stringResource(it.message) }
        FivviField(
            value = editor.input,
            onValueChange = actions.onNameInput,
            label = stringResource(R.string.my_profile_name_label),
            modifier = Modifier
                .focusRequester(focus)
                .semantics { contentType = ContentType.PersonFullName }
                .testTag(ProfileTags.NAME_INPUT),
            error = message,
            // Under the field, not as its supporting text: a field merges what it contains, and the message needs its own tag.
            showsErrorMessage = false,
            enabled = !editor.saving,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { actions.onSaveName() }),
        )
        if (message != null) {
            FieldErrorLine(
                message = message,
                modifier = Modifier.testTag(ProfileTags.NAME_ERROR).semantics { liveRegion = LiveRegionMode.Assertive },
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
