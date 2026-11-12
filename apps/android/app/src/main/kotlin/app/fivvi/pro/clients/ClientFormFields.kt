package app.fivvi.pro.clients

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
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
import androidx.compose.ui.res.painterResource
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
import app.fivvi.core.R
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.FivviField
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead

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
 * `.openExisting`, `.otherEmail`, `.failed`. The messages are the web's (`clients.addDialog.errors.*`). The fields are the
 * kit's, with their message under them behind the warning icon; the language is a grouped list with a check on the chosen
 * row, as *Profiel → Taal* has it.
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
    val nameMessage = messages.nameError?.let { stringResource(it.message) }
    val emailMessage = messages.emailError?.let { stringResource(it.message) }
    val duplicateMessage = messages.duplicate?.let { stringResource(R.string.clients_add_dialog_exists, it.name) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            FivviField(
                value = form.name,
                onValueChange = actions.onNameChange,
                label = stringResource(R.string.clients_add_dialog_name_label),
                modifier = Modifier.focusRequester(focus).testTag("$tag.name"),
                error = nameMessage,
                // Under the field, not as its supporting text: the message needs its own tag.
                showsErrorMessage = false,
                enabled = enabled,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            if (nameMessage != null) ErrorText(nameMessage, "$tag.nameError")
        }
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            FivviField(
                value = form.email,
                onValueChange = actions.onEmailChange,
                label = stringResource(R.string.clients_add_dialog_email_label),
                modifier = Modifier.semantics { contentType = ContentType.EmailAddress }.testTag("$tag.email"),
                error = emailMessage ?: duplicateMessage,
                showsErrorMessage = false,
                enabled = enabled,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { actions.onDone() }),
            )
            if (emailMessage != null) ErrorText(emailMessage, "$tag.emailError")
        }
        messages.duplicate?.let { DuplicateOffer(tag, it, duplicateMessage.orEmpty(), actions) }
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
    FieldErrorLine(text, Modifier.testTag(tag).semantics { liveRegion = LiveRegionMode.Assertive })
}

// AC3: "Anna de Vries gebruikt dit e-mailadres al." with the two ways on; no second client is created.
@Composable
private fun DuplicateOffer(tag: String, duplicate: Duplicate, message: String, actions: ClientFormActions) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("$tag.duplicate").semantics {
            liveRegion = LiveRegionMode.Assertive
        },
        verticalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        FieldErrorLine(message)
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.clients_add_dialog_open_existing, duplicate.name),
                onClick = { actions.onOpenExisting(duplicate) },
                modifier = Modifier.testTag("$tag.openExisting"),
                style = PillButtonStyle.Tonal,
            )
            PillButton(
                text = stringResource(R.string.clients_add_dialog_other_email),
                onClick = actions.onUseAnotherEmail,
                modifier = Modifier.testTag("$tag.otherEmail"),
                style = PillButtonStyle.Tonal,
            )
        }
    }
}

// *Taal voor e-mails*: Standaard (Nederlands) | Nederlands | English, as the rows of a grouped list (three choices, all in
// view) with a check on the chosen one.
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
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            text = stringResource(R.string.clients_add_dialog_locale_label),
            modifier = Modifier.padding(start = Spacing.space4).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
        val labels = CHOICE_TAGS.map { (choice, _) ->
            when (choice) {
                EmailLanguageChoice.Default -> stringResource(R.string.clients_add_dialog_locale_default, defaultName)
                EmailLanguageChoice.Dutch -> stringResource(R.string.clients_add_dialog_locale_nl)
                EmailLanguageChoice.English -> stringResource(R.string.clients_add_dialog_locale_en)
            }
        }
        InsetGroupedList(Modifier.selectableGroup()) {
            CHOICE_TAGS.forEachIndexed { index, (choice, key) ->
                row {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = Spacing.space12)
                            .selectable(
                                selected = choice == selected,
                                enabled = enabled,
                                role = Role.RadioButton,
                                onClick = { onChange(choice) },
                            )
                            .testTag("$tag.language.$key")
                            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(labels[index], style = MaterialTheme.typography.body)
                        if (choice == selected) {
                            Icon(
                                painterResource(R.drawable.ic_check),
                                contentDescription = null,
                                modifier = Modifier.size(Spacing.space6),
                                tint = MaterialTheme.tokens.accentText,
                            )
                        }
                    }
                }
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
