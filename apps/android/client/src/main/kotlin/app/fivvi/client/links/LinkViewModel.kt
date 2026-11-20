package app.fivvi.client.links

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The link the app was opened with, kept until it is shown (E017 #506). A link that arrives while the person is signed
 * out waits here through the sign-in, and the link screen shows once they are in; [dismiss] returns to the tabs. The
 * address is kept in the saved state, so it also survives the system killing the process in the background: the
 * recreated activity does not read its intent again, it gets the link from here.
 */
class LinkViewModel(private val saved: SavedStateHandle) : ViewModel() {
    private val router = LinkRouter()
    private val pending = MutableStateFlow(router.open(saved.get<String>(URL)))
    val link: StateFlow<OpenedLink?> = pending.asStateFlow()

    /** An address the phone opened the app with. Anything the router ignores leaves the current state as it is. */
    fun open(url: String?) {
        router.open(url)?.let {
            saved[URL] = it.url
            pending.value = it
        }
    }

    fun dismiss() {
        saved.remove<String>(URL)
        pending.value = null
    }

    private companion object {
        const val URL = "link.url"
    }
}
