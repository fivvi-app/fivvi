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

/** The states of TM-01: the email step, then the code step. */
sealed interface SignInState {
    data class EmailEntry(val email: String = "", val error: SignInError? = null) : SignInState

    data class Sending(val email: String) : SignInState

    data class CodeEntry(val email: String, val code: String = "", val error: SignInError? = null) : SignInState

    data class Checking(val email: String, val code: String) : SignInState
}

/**
 * Signs in with the emailed code through the generated client: asks for the email in [locale], exchanges the 6-digit
 * code for a bearer token and hands the token to the [session], on [io]: storing it is Keystore crypto and file I/O.
 */
class SignInViewModel(
    private val api: SignInApi,
    private val session: Session,
    private val locale: ApiLocale,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _state = MutableStateFlow<SignInState>(SignInState.EmailEntry())
    val state: StateFlow<SignInState> = _state.asStateFlow()

    fun onEmailChange(email: String) {
        (_state.value as? SignInState.EmailEntry)?.let { _state.value = SignInState.EmailEntry(email) }
    }

    fun sendCode() {
        val current = _state.value as? SignInState.EmailEntry ?: return
        val email = current.email.trim()
        if (email.isEmpty()) {
            _state.value = current.copy(error = SignInError.InvalidEmail)
            return
        }
        _state.value = SignInState.Sending(email)
        viewModelScope.launch { _state.value = requestCode(email) }
    }

    /** Takes digits only, at most six; the sixth digit sends the code without another tap. */
    fun onCodeChange(input: String) {
        val current = _state.value as? SignInState.CodeEntry ?: return
        val code = input.filter(Char::isDigit).take(CODE_LENGTH)
        _state.value = SignInState.CodeEntry(current.email, code)
        if (code.length == CODE_LENGTH) submitCode()
    }

    fun submitCode() {
        val current = _state.value as? SignInState.CodeEntry ?: return
        if (current.code.length != CODE_LENGTH) return
        _state.value = SignInState.Checking(current.email, current.code)
        viewModelScope.launch { _state.value = exchange(current.email, current.code) }
    }

    private suspend fun requestCode(email: String): SignInState {
        val response = try {
            api.requestSignIn(SignInRequest(email, locale))
        } catch (_: IOException) {
            return SignInState.EmailEntry(email, SignInError.NoConnection)
        }
        return when {
            response.isSuccessful -> SignInState.CodeEntry(email)
            response.code() == HTTP_BAD_REQUEST -> SignInState.EmailEntry(email, SignInError.InvalidEmail)
            else -> SignInState.EmailEntry(email, SignInError.Generic)
        }
    }

    // On success the session turns signed in and the screen is replaced, so the state it leaves stays Checking.
    private suspend fun exchange(email: String, code: String): SignInState {
        val response = try {
            api.exchangeSignInCode(SignInTokenRequest(email, code))
        } catch (_: IOException) {
            return SignInState.CodeEntry(email, code, SignInError.NoConnection)
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
