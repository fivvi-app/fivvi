package app.fivvi.pro.clients

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import app.fivvi.api.models.Locale
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.R

/** What the fields of the add and the edit form show besides the input: the messages of the last answer of the API. */
data class ClientFormMessages(
    val nameError: NameError? = null,
    val emailError: EmailError? = null,
    val duplicate: Duplicate? = null,
    val failed: Boolean = false,
)

/** What the fields call back: input, the offer of the duplicate, and *done* on the keyboard. */
data class ClientFormActions(
    val onNameChange: (String) -> Unit,
    val onEmailChange: (String) -> Unit,
    val onLanguageChange: (EmailLanguageChoice) -> Unit,
    val onOpenExisting: (Duplicate) -> Unit,
    val onUseAnotherEmail: () -> Unit,
    val onDone: () -> Unit,
)

/**
 * The three fields of quick add and of the overview's edit: *Naam* (required, focused), *E-mailadres* (required) and
 * *Taal voor e-mails* with the workspace default named and preselected. [tag] is the prefix of the test tags (`clients.add`
 * or `clientProfile.edit`): `.name`, `.email`, `.nameError`, `.emailError`, `.language.default|nl-NL|en`, `.duplicate`,
 * `.openExisting`, `.otherEmail`, `.failed`. The messages are the web's (`clients.addDialog.errors.*`).
 */
@Composable
fun ClientFormFields(
    tag: String,
    form: ClientForm,
    messages: ClientFormMessages,
    workspaceDefault: Locale,
    enabled: Boolean,
    actions: ClientFormActions,
    modifier: Modifier = Modifier,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
        OutlinedTextField(
            value = form.name,
            onValueChange = actions.onNameChange,
            modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag("$tag.name"),
            enabled = enabled,
            label = { Text(stringResource(R.string.clients_add_dialog_name_label)) },
            supportingText = messages.nameError?.let { error ->
                { ErrorText(stringResource(error.message), "$tag.nameError") }
            },
            singleLine = true,
            isError = messages.nameError != null,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            value = form.email,
            onValueChange = actions.onEmailChange,
            modifier = Modifier.fillMaxWidth().semantics {
                contentType = ContentType.EmailAddress
            }.testTag("$tag.email"),
            enabled = enabled,
            label = { Text(stringResource(R.string.clients_add_dialog_email_label)) },
            supportingText = messages.emailError?.let { error ->
                { ErrorText(stringResource(error.message), "$tag.emailError") }
            },
            singleLine = true,
            isError = messages.emailError != null || messages.duplicate != null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { actions.onDone() }),
        )
        messages.duplicate?.let { DuplicateOffer(tag, it, actions) }
        LanguageChoices(tag, form.language, workspaceDefault, enabled, actions.onLanguageChange)
        if (messages.failed) {
            ErrorText(stringResource(R.string.clients_add_dialog_errors_not_saved), "$tag.failed")
        }
    }
}

@get:StringRes
private val NameError.message: Int
    get() = when (this) {
        NameError.Required -> R.string.clients_add_dialog_errors_name_required
        NameError.TooLong -> R.string.clients_add_dialog_errors_name_too_long
    }

@get:StringRes
private val EmailError.message: Int
    get() = when (this) {
        EmailError.Invalid -> R.string.clients_add_dialog_errors_email_invalid
    }

// Read out when it appears, as the web's `role="alert"`.
@Composable
private fun ErrorText(text: String, tag: String) {
    Text(
        text = text,
        modifier = Modifier.testTag(tag).semantics { liveRegion = LiveRegionMode.Assertive },
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.body,
    )
}

// AC3: "Anna de Vries gebruikt dit e-mailadres al." with the two ways on; no second client is created.
@Composable
private fun DuplicateOffer(tag: String, duplicate: Duplicate, actions: ClientFormActions) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("$tag.duplicate").semantics {
            liveRegion = LiveRegionMode.Assertive
        },
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        Text(
            text = stringResource(R.string.clients_add_dialog_exists, duplicate.name),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.body,
        )
        OutlinedButton(
            onClick = { actions.onOpenExisting(duplicate) },
            modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag("$tag.openExisting"),
        ) {
            Text(stringResource(R.string.clients_add_dialog_open_existing, duplicate.name))
        }
        OutlinedButton(
            onClick = actions.onUseAnotherEmail,
            modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag("$tag.otherEmail"),
        ) {
            Text(stringResource(R.string.clients_add_dialog_other_email))
        }
    }
}

// *Taal voor e-mails*: Standaard (Nederlands) | Nederlands | English, as radio buttons (three choices, all in view).
@Composable
private fun LanguageChoices(
    tag: String,
    selected: EmailLanguageChoice,
    workspaceDefault: Locale,
    enabled: Boolean,
    onChange: (EmailLanguageChoice) -> Unit,
) {
    val defaultName = stringResource(
        if (workspaceDefault == Locale.EN) R.string.clients_language_names_en else R.string.clients_language_names_nl,
    )
    Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            text = stringResource(R.string.clients_add_dialog_locale_label),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.body,
        )
        for ((choice, key) in CHOICE_TAGS) {
            val label = when (choice) {
                EmailLanguageChoice.Default -> stringResource(R.string.clients_add_dialog_locale_default, defaultName)
                EmailLanguageChoice.Dutch -> stringResource(R.string.clients_add_dialog_locale_nl)
                EmailLanguageChoice.English -> stringResource(R.string.clients_add_dialog_locale_en)
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = Spacing.space12)
                    .selectable(
                        selected = choice == selected,
                        enabled = enabled,
                        role = Role.RadioButton,
                        onClick = { onChange(choice) },
                    )
                    .testTag("$tag.language.$key"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            ) {
                RadioButton(selected = choice == selected, onClick = null, enabled = enabled)
                Text(label, style = MaterialTheme.typography.body)
            }
        }
    }
}

/** The tag suffix of each choice, shared with the iOS accessibility identifiers and the Maestro flows. */
private val CHOICE_TAGS = listOf(
    EmailLanguageChoice.Default to "default",
    EmailLanguageChoice.Dutch to "nl-NL",
    EmailLanguageChoice.English to "en",
)
