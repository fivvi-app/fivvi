package app.fivvi.pro.signin

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.pro.R

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object SignInTags {
    const val EMAIL = "signIn.email"
    const val SEND = "signIn.send"
    const val CODE = "signIn.code"
    const val SUBMIT = "signIn.submit"
    const val LOADING = "signIn.loading"
    const val ERROR = "signIn.error"
}

/** TM-01: the email step and the code step. Scrolls, so text at the largest font scale wraps instead of being cut off. */
@Composable
fun SignInScreen(
    state: SignInState,
    onEmailChange: (String) -> Unit,
    onSendCode: () -> Unit,
    onCodeChange: (String) -> Unit,
    onSubmitCode: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (state) {
            is SignInState.EmailEntry -> EmailStep(state.email, state.error, true, onEmailChange, onSendCode)

            is SignInState.Sending -> EmailStep(state.email, null, false, onEmailChange, onSendCode)

            is SignInState.CodeEntry ->
                CodeStep(state.email, state.code, state.error, true, onCodeChange, onSubmitCode)

            is SignInState.Checking -> CodeStep(state.email, state.code, null, false, onCodeChange, onSubmitCode)
        }
    }
}

@Composable
private fun EmailStep(
    email: String,
    error: SignInError?,
    enabled: Boolean,
    onEmailChange: (String) -> Unit,
    onSendCode: () -> Unit,
) {
    Title(R.string.sign_in_title)
    OutlinedTextField(
        value = email,
        onValueChange = onEmailChange,
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.EMAIL),
        enabled = enabled,
        label = { Text(stringResource(R.string.sign_in_email_label)) },
        singleLine = true,
        isError = error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSendCode() }),
    )
    ErrorText(error)
    ActionButton(R.string.sign_in_send_code, SignInTags.SEND, enabled && email.isNotBlank(), !enabled, onSendCode)
}

@Composable
private fun CodeStep(
    email: String,
    code: String,
    error: SignInError?,
    enabled: Boolean,
    onCodeChange: (String) -> Unit,
    onSubmitCode: () -> Unit,
) {
    Title(R.string.sign_in_check_email_title)
    Text(
        text = stringResource(R.string.sign_in_check_email_body_app, email),
        style = MaterialTheme.typography.body,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = code,
        onValueChange = onCodeChange,
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.CODE),
        enabled = enabled,
        label = { Text(stringResource(R.string.sign_in_code_label)) },
        supportingText = { Text(stringResource(R.string.sign_in_code_help)) },
        singleLine = true,
        isError = error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSubmitCode() }),
    )
    ErrorText(error)
    ActionButton(
        R.string.sign_in_submit_code,
        SignInTags.SUBMIT,
        enabled && code.length == CODE_LENGTH,
        !enabled,
        onSubmitCode,
    )
}

@Composable
private fun Title(@StringRes text: Int) {
    Text(
        text = stringResource(text),
        modifier = Modifier.fillMaxWidth().semantics { heading() },
        style = MaterialTheme.typography.title1,
    )
}

@Composable
private fun ErrorText(error: SignInError?) {
    if (error == null) return
    Text(
        text = stringResource(error.message),
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.ERROR).semantics { liveRegion = LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.body,
    )
}

/** The primary button; while [loading] a labelled progress indicator takes its place. */
@Composable
private fun ActionButton(@StringRes label: Int, tag: String, enabled: Boolean, loading: Boolean, onClick: () -> Unit) {
    if (loading) {
        val description = stringResource(R.string.common_loading)
        CircularProgressIndicator(Modifier.testTag(SignInTags.LOADING).semantics { contentDescription = description })
    } else {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag(tag),
        ) {
            Text(stringResource(label))
        }
    }
}

private val SignInError.message: Int
    @StringRes get() = when (this) {
        SignInError.InvalidEmail -> R.string.sign_in_errors_invalid_email
        SignInError.InvalidCode -> R.string.sign_in_errors_invalid_or_expired_code
        SignInError.NoConnection -> R.string.sign_in_errors_no_connection
        SignInError.Generic -> R.string.sign_in_errors_generic
    }

private const val CODE_LENGTH = 6
