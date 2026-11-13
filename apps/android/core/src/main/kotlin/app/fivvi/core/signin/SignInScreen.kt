package app.fivvi.core.signin

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.LanguageSwitch
import app.fivvi.core.R
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.FivviField
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.theme.LocalDarkTheme
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object SignInTags {
    /** The app's icon above the title: the Fivvi Pro dial or the plain Fivvi one. */
    const val LOGO = "signIn.logo"
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

    /** The switch: `signIn.language.nl-NL` and `signIn.language.en` are its two options. */
    const val LANGUAGE = "signIn.language"
}

/**
 * An app's icon on the sign-in: the picture in each mode and its accessible name. It is an image in the screen, apart from
 * the launcher icon. [light] shows in light mode and [dark] in dark mode, as the brand files are drawn for each.
 */
class SignInLogo(@DrawableRes val light: Int, @DrawableRes val dark: Int, @StringRes val name: Int)

/** What the screen does for the person: the view model's functions, or tests' stand-ins. */
class SignInActions(
    val onEmailChange: (String) -> Unit,
    val onSendCode: () -> Unit,
    val onCodeChange: (String) -> Unit,
    val onSubmitCode: () -> Unit,
    val onResend: () -> Unit,
    val onChangeEmail: () -> Unit,
    val onRetry: () -> Unit,
    val language: AppLanguage = AppLanguage.ENGLISH,
    val onChooseLanguage: (AppLanguage) -> Unit = {},
)

/** The icon above the title: 84 dp on the email step, 64 dp on the code step (the prototype's *Inloggen (TM-01)*). */
private val EmailStepLogoSize = 84.dp
private val CodeStepLogoSize = 64.dp

/**
 * TM-01: the email step and the code step. Scrolls, so text at the largest font scale wraps instead of being cut off.
 * [showsSignedOutNotice]: the API stopped accepting the token, which the screen says above the form (AC9). [logo] is the
 * app's icon, shown above the title (E020): the Fivvi Pro day dial in Fivvi Pro, the plain day dial in Fivvi. It may be absent.
 */
@Composable
fun SignInScreen(
    state: SignInState,
    actions: SignInActions,
    modifier: Modifier = Modifier,
    showsSignedOutNotice: Boolean = false,
    logo: SignInLogo? = null,
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
        if (logo != null) Logo(logo, if (atCodeStep) CodeStepLogoSize else EmailStepLogoSize)
        Title(if (atCodeStep) R.string.sign_in_check_email_title else R.string.sign_in_title)
        if (showsSignedOutNotice) Notice()
        if (atCodeStep) CodeStep(state, busy, actions) else EmailStep(state, busy, actions)
        LanguageSwitch(SignInTags.LANGUAGE, actions.language, actions.onChooseLanguage)
    }
}

@Composable
private fun EmailStep(state: SignInState, busy: Boolean, actions: SignInActions) {
    val error = (state as? SignInState.EmailEntry)?.error
    val focus = remember { FocusRequester() }
    // Back from the code step, or after a request: the field is ready. Not at the first start, which stays quiet.
    LaunchedEffect(busy) { if (!busy && state.email.isNotEmpty()) focus.requestFocus() }
    FivviField(
        value = state.email,
        onValueChange = actions.onEmailChange,
        label = stringResource(R.string.sign_in_email_label),
        modifier = Modifier
            .focusRequester(focus)
            .semantics { contentType = ContentType.EmailAddress }
            .testTag(SignInTags.EMAIL),
        error = error?.let { stringResource(it.message) },
        showsErrorMessage = false,
        enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { actions.onSendCode() }),
    )
    if (error != null) ErrorLine(error)
    if (busy) {
        Loading()
    } else {
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.sign_in_send_code),
                onClick = actions.onSendCode,
                modifier = Modifier.testTag(SignInTags.SEND),
                enabled = state.email.isNotBlank(),
            )
            if (error == SignInError.NoConnection) RetryButton(actions.onRetry)
        }
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
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.CHECK_EMAIL),
    )
    FivviField(
        value = code,
        onValueChange = actions.onCodeChange,
        label = stringResource(R.string.sign_in_code_label),
        modifier = Modifier
            .focusRequester(focus)
            // The phone's one-time-code autofill (SMS) fills this field, like a paste: digits only, six of them.
            .semantics { contentType = ContentType.SmsOtpCode }
            .testTag(SignInTags.CODE),
        error = codeEntry?.error?.let { stringResource(it.message) },
        showsErrorMessage = false,
        help = stringResource(R.string.sign_in_code_help),
        enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { actions.onSubmitCode() }),
    )
    codeEntry?.error?.let { ErrorLine(it) }
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
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.sign_in_submit_code),
                onClick = actions.onSubmitCode,
                modifier = Modifier.testTag(SignInTags.SUBMIT),
                enabled = code.length == CODE_LENGTH,
            )
            if (codeEntry?.error == SignInError.NoConnection) RetryButton(actions.onRetry)
            PillButton(
                text = stringResource(R.string.sign_in_resend),
                onClick = actions.onResend,
                modifier = Modifier.testTag(SignInTags.RESEND),
                style = PillButtonStyle.Tonal,
            )
            PillButton(
                text = stringResource(R.string.sign_in_change_email),
                onClick = actions.onChangeEmail,
                modifier = Modifier.testTag(SignInTags.CHANGE_EMAIL),
                style = PillButtonStyle.Text,
            )
        }
    }
}

// The icon is an image in the screen, in the version of the mode shown, named for a screen reader.
@Composable
private fun Logo(logo: SignInLogo, size: Dp) {
    Image(
        painter = painterResource(if (LocalDarkTheme.current) logo.dark else logo.light),
        contentDescription = stringResource(logo.name),
        modifier = Modifier.size(size).testTag(SignInTags.LOGO),
    )
}

@Composable
private fun Title(@StringRes text: Int) {
    Text(
        text = stringResource(text),
        modifier = Modifier.fillMaxWidth().testTag(SignInTags.TITLE).semantics { heading() },
        style = MaterialTheme.typography.title1,
        textAlign = TextAlign.Center,
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

// What went wrong, under the field it belongs to: the warning icon and the words, announced when they appear.
@Composable
private fun ErrorLine(error: SignInError) {
    FieldErrorLine(
        message = stringResource(error.message),
        modifier = Modifier.testTag(SignInTags.ERROR).semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun RetryButton(onClick: () -> Unit) {
    PillButton(
        text = stringResource(R.string.common_retry),
        onClick = onClick,
        modifier = Modifier.testTag(SignInTags.RETRY),
        style = PillButtonStyle.Tonal,
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

private val SignInError.message: Int
    @StringRes get() = when (this) {
        SignInError.InvalidEmail -> R.string.sign_in_errors_invalid_email
        SignInError.InvalidCode -> R.string.sign_in_errors_invalid_or_expired_code
        SignInError.NoConnection -> R.string.sign_in_errors_no_connection
        SignInError.Generic -> R.string.sign_in_errors_generic
    }
