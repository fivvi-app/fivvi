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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.pro.R

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object SignInTags {
    const val TITLE = "signIn.title"
    const val NOTICE = "signIn.notice"
    const val EMAIL = "signIn.email"
    const val SEND = "signIn.send"
    const val CHECK_EMAIL = "signIn.checkEmail"
    const val CODE = "signIn.code"
    const val SUBMIT = "signIn.submit"
    const val RESEND = "signIn.resend"
    const val RESENT = "signIn.resent"
    const val CHANGE_EMAIL = "signIn.changeEmail"
    const val RETRY = "signIn.retry"
    const val LOADING = "signIn.loading"
    const val ERROR = "signIn.error"
}

/** What the screen does for the person: the view model's functions, or tests' stand-ins. */
class SignInActions(
    val onEmailChange: (String) -> Unit,
    val onSendCode: () -> Unit,
    val onCodeChange: (String) -> Unit,
    val onSubmitCode: () -> Unit,
    val onResend: () -> Unit,
    val onChangeEmail: () -> Unit,
    val onRetry: () -> Unit,
)

/**
 * TM-01: the email step and the code step. Scrolls, so text at the largest font scale wraps instead of being cut off.
 * [showsSignedOutNotice]: the API stopped accepting the token, which the screen says above the form (AC9).
 */
@Composable
fun SignInScreen(
    state: SignInState,
    actions: SignInActions,
    modifier: Modifier = Modifier,
    showsSignedOutNotice: Boolean = false,
) {
    // One call site per step for all its states, so the field keeps its focus while a request is under way.
    val busy = state is SignInState.Sending || state is SignInState.Checking || state is SignInState.Resending
    Column(
        modifier = modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val atCodeStep = state !is SignInState.EmailEntry && state !is SignInState.Sending
        Title(if (atCodeStep) R.string.sign_in_check_email_title else R.string.sign_in_title)
        if (showsSignedOutNotice) Notice()
        if (atCodeStep) CodeStep(state, busy, actions) else EmailStep(state, busy, actions)
        val error = (state as? SignInState.EmailEntry)?.error ?: (state as? SignInState.CodeEntry)?.error
        if (error != null) {
            ErrorText(error)
            if (error ==
                SignInError.NoConnection
            ) {
                SecondaryButton(R.string.common_retry, SignInTags.RETRY, actions.onRetry)
            }
        }
    }
}

@Composable
private fun EmailStep(state: SignInState, busy: Boolean, actions: SignInActions) {
    val error = (state as? SignInState.EmailEntry)?.error
    val focus = remember { FocusRequester() }
    // Back from the code step, or after a request: the field is ready. Not at the first start, which stays quiet.
    LaunchedEffect(busy) { if (!busy && state.email.isNotEmpty()) focus.requestFocus() }
    OutlinedTextField(
        value = state.email,
        onValueChange = actions.onEmailChange,
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focus)
            .semantics { contentType = ContentType.EmailAddress }
            .testTag(SignInTags.EMAIL),
        enabled = !busy,
        label = { Text(stringResource(R.string.sign_in_email_label)) },
        singleLine = true,
        isError = error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { actions.onSendCode() }),
    )
    if (busy) {
        Loading()
    } else {
        PrimaryButton(R.string.sign_in_send_code, SignInTags.SEND, state.email.isNotBlank(), actions.onSendCode)
    }
}

@Composable
private fun CodeStep(state: SignInState, busy: Boolean, actions: SignInActions) {
    val code = (state as? SignInState.CodeEntry)?.code ?: (state as? SignInState.Checking)?.code
        ?: (state as? SignInState.Resending)?.code.orEmpty()
    val codeEntry = state as? SignInState.CodeEntry
    val focus = remember { FocusRequester() }
    // The code field is ready when the step opens and after a wrong code or a resend: it was disabled meanwhile.
    LaunchedEffect(busy) { if (!busy) focus.requestFocus() }
    Text(
        text = stringResource(R.string.sign_in_check_email_body_app, state.email),
        style = MaterialTheme.typography.body,
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.CHECK_EMAIL),
    )
    OutlinedTextField(
        value = code,
        onValueChange = actions.onCodeChange,
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focus)
            // The phone's one-time-code autofill (SMS) fills this field, like a paste: digits only, six of them.
            .semantics { contentType = ContentType.SmsOtpCode }
            .testTag(SignInTags.CODE),
        enabled = !busy,
        label = { Text(stringResource(R.string.sign_in_code_label)) },
        supportingText = { Text(stringResource(R.string.sign_in_code_help)) },
        singleLine = true,
        isError = codeEntry?.error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { actions.onSubmitCode() }),
    )
    if (codeEntry?.resent == true) {
        Text(
            text = stringResource(R.string.sign_in_resent, state.email),
            modifier = Modifier
                .fillMaxWidth()
                .testTag(SignInTags.RESENT)
                .semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.body,
        )
    }
    if (busy) {
        Loading()
    } else {
        PrimaryButton(R.string.sign_in_submit_code, SignInTags.SUBMIT, code.length == CODE_LENGTH, actions.onSubmitCode)
        SecondaryButton(R.string.sign_in_resend, SignInTags.RESEND, actions.onResend)
        SecondaryButton(R.string.sign_in_change_email, SignInTags.CHANGE_EMAIL, actions.onChangeEmail)
    }
}

@Composable
private fun Title(@StringRes text: Int) {
    Text(
        text = stringResource(text),
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.TITLE).semantics { heading() },
        style = MaterialTheme.typography.title1,
    )
}

// Read out when the screen appears after the API stopped accepting the token.
@Composable
private fun Notice() {
    Text(
        text = stringResource(R.string.sign_in_signed_out_notice),
        modifier = Modifier
            .fillMaxWidth()
            .testTag(SignInTags.NOTICE)
            .semantics { liveRegion = LiveRegionMode.Polite },
        style = MaterialTheme.typography.body,
    )
}

@Composable
private fun ErrorText(error: SignInError) {
    Text(
        text = stringResource(error.message),
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.ERROR).semantics { liveRegion = LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.body,
    )
}

/** The loading state: a labelled progress indicator that a screen reader announces. */
@Composable
private fun Loading() {
    val description = stringResource(R.string.common_loading)
    CircularProgressIndicator(
        Modifier.testTag(SignInTags.LOADING).semantics {
            contentDescription = description
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
private fun PrimaryButton(@StringRes label: Int, tag: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag(tag),
    ) {
        Text(stringResource(label), textAlign = TextAlign.Center)
    }
}

@Composable
private fun SecondaryButton(@StringRes label: Int, tag: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag(tag)) {
        Text(stringResource(label), textAlign = TextAlign.Center)
    }
}

private val SignInError.message: Int
    @StringRes get() = when (this) {
        SignInError.InvalidEmail -> R.string.sign_in_errors_invalid_email
        SignInError.InvalidCode -> R.string.sign_in_errors_invalid_or_expired_code
        SignInError.NoConnection -> R.string.sign_in_errors_no_connection
        SignInError.Generic -> R.string.sign_in_errors_generic
    }
