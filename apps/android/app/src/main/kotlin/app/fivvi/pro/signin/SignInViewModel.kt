package app.fivvi.pro.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.models.Locale as ApiLocale
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.pro.auth.Session
import java.io.IOException
import java.net.HttpURLConnection.HTTP_BAD_REQUEST
import java.net.HttpURLConnection.HTTP_UNAUTHORIZED
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

/** What went wrong on TM-01. The code step shows [InvalidCode] for every refused code, as the API never says why. */
enum class SignInError { InvalidEmail, InvalidCode, NoConnection, Generic }

/**
 * The states of TM-01: the email step, then the code step. [Sending], [Checking] and [Resending] are a request under
 * way; a lost connection ([SignInError.NoConnection]) can be tried again with [SignInViewModel.retry].
 */
sealed interface SignInState {
    /** The address the sign-in email goes to (or is typed for), which the code step names and the exchange sends. */
    val email: String

    data class EmailEntry(override val email: String = "", val error: SignInError? = null) : SignInState

    data class Sending(override val email: String) : SignInState

    /** [resent]: a new email was sent from this step; the step says so until the next attempt. */
    data class CodeEntry(
        override val email: String,
        val code: String = "",
        val error: SignInError? = null,
        val resent: Boolean = false,
    ) : SignInState

    data class Checking(override val email: String, val code: String) : SignInState

    /** A new sign-in email is on its way, from the code step. */
    data class Resending(override val email: String, val code: String) : SignInState
}

/**
 * Signs in with the emailed code through the generated client: asks for the email in [locale] (the language shown when
 * the request goes out, so a switch on the screen counts, F010 AC4), exchanges the 6-digit
 * code for a bearer token and hands the token to the [session], on [io]: storing it is Keystore crypto and file I/O.
 * The code step can ask for a new email ([resendCode]), go back to change the address ([changeEmail]) and, after a lost
 * connection, try again ([retry]).
 */
class SignInViewModel(
    private val api: SignInApi,
    private val session: Session,
    private val locale: () -> ApiLocale,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    constructor(
        api: SignInApi,
        session: Session,
        locale: ApiLocale,
        io: CoroutineDispatcher = Dispatchers.IO,
    ) : this(api, session, { locale }, io)

    /** What [retry] does again after a lost connection. */
    private enum class Attempt { RequestCode, SubmitCode, ResendCode }

    private val _state = MutableStateFlow<SignInState>(SignInState.EmailEntry())
    val state: StateFlow<SignInState> = _state.asStateFlow()
    private var failedAttempt: Attempt? = null

    /** Takes what the address field holds now. The last error (and its retry) stays until the next attempt. */
    fun onEmailChange(email: String) {
        (_state.value as? SignInState.EmailEntry)?.let { _state.value = it.copy(email = email) }
    }

    fun sendCode() {
        val current = _state.value as? SignInState.EmailEntry ?: return
        val email = current.email.trim()
        if (email.isEmpty()) {
            _state.value = current.copy(error = SignInError.InvalidEmail)
            return
        }
        failedAttempt = null
        _state.value = SignInState.Sending(email)
        viewModelScope.launch {
            _state.value = when (val answer = requestEmail(email)) {
                null -> SignInState.CodeEntry(email)
                else -> failure(answer, SignInState.EmailEntry(email, answer), Attempt.RequestCode)
            }
        }
    }

    /**
     * Asks for a new sign-in email to the same address (the API makes the earlier code stop working). The code field is
     * ready for the new code.
     */
    fun resendCode() {
        val current = _state.value as? SignInState.CodeEntry ?: return
        failedAttempt = null
        _state.value = SignInState.Resending(current.email, current.code)
        viewModelScope.launch {
            _state.value = when (val answer = requestEmail(current.email)) {
                null -> SignInState.CodeEntry(current.email, resent = true)
                else -> failure(answer, SignInState.CodeEntry(current.email, current.code, answer), Attempt.ResendCode)
            }
        }
    }

    /** Goes back to the email step, with the address kept so it can be corrected. */
    fun changeEmail() {
        val current = _state.value as? SignInState.CodeEntry ?: return
        failedAttempt = null
        _state.value = SignInState.EmailEntry(current.email)
    }

    /** Does again what the lost connection interrupted; nothing after any other failure. */
    fun retry() {
        when (failedAttempt) {
            Attempt.RequestCode -> sendCode()
            Attempt.SubmitCode -> submitCode()
            Attempt.ResendCode -> resendCode()
            null -> Unit
        }
    }

    /**
     * Takes the digits 0 to 9 only (not other scripts' digits, which the API refuses), at most six; the sixth digit sends
     * the code without another tap. The last error (and its retry) and the resent notice stay until the next attempt.
     */
    fun onCodeChange(input: String) {
        val current = _state.value as? SignInState.CodeEntry ?: return
        val code = input.filter { it in '0'..'9' }.take(CODE_LENGTH)
        _state.value = current.copy(code = code)
        if (code.length == CODE_LENGTH) submitCode()
    }

    fun submitCode() {
        val current = _state.value as? SignInState.CodeEntry ?: return
        if (current.code.length != CODE_LENGTH) return
        failedAttempt = null
        _state.value = SignInState.Checking(current.email, current.code)
        viewModelScope.launch { _state.value = exchange(current.email, current.code) }
    }

    // The error of a failed request for the sign-in email, or null when the API accepted it.
    private suspend fun requestEmail(email: String): SignInError? {
        val response = try {
            api.requestSignIn(SignInRequest(email, locale()))
        } catch (_: IOException) {
            return SignInError.NoConnection
        }
        return when {
            response.isSuccessful -> null
            response.code() == HTTP_BAD_REQUEST -> SignInError.InvalidEmail
            else -> SignInError.Generic
        }
    }

    // Remembers what a lost connection interrupted, for retry().
    private fun failure(error: SignInError, state: SignInState, attempt: Attempt): SignInState {
        failedAttempt = attempt.takeIf { error == SignInError.NoConnection }
        return state
    }

    // On success the session turns signed in and the screen is replaced, so the state it leaves stays Checking.
    private suspend fun exchange(email: String, code: String): SignInState {
        val response = try {
            api.exchangeSignInCode(SignInTokenRequest(email, code))
        } catch (_: IOException) {
            return failure(
                SignInError.NoConnection,
                SignInState.CodeEntry(email, code, SignInError.NoConnection),
                Attempt.SubmitCode,
            )
        } catch (_: SerializationException) {
            return SignInState.CodeEntry(email, code, SignInError.Generic)
        }
        val token = response.body()?.takeIf { response.isSuccessful }?.token
        return when {
            token != null -> store(token, email, code)
            response.code() == HTTP_UNAUTHORIZED -> SignInState.CodeEntry(email, error = SignInError.InvalidCode)
            else -> SignInState.CodeEntry(email, code, SignInError.Generic)
        }
    }

    // The session ends up signed in, or the state shows why not: a token that can't be stored is no sign-in.
    private suspend fun store(token: String, email: String, code: String): SignInState = try {
        withContext(io) { session.signIn(token) }
        SignInState.Checking(email, code)
    } catch (_: IOException) {
        SignInState.CodeEntry(email, code, SignInError.Generic)
    }
}

/** The digits of the emailed code (EM-08, shared with the screen). */
internal const val CODE_LENGTH = 6
