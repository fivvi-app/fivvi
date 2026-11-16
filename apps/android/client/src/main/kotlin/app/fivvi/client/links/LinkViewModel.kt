package app.fivvi.client.links

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The link the app was opened with, kept until it is shown (E017 #506). A link that arrives while the person is signed
 * out waits here through the sign-in, and the link screen shows once they are in; [dismiss] returns to the tabs.
 */
class LinkViewModel(private val router: LinkRouter = LinkRouter()) : ViewModel() {
    private val pending = MutableStateFlow<OpenedLink?>(null)
    val link: StateFlow<OpenedLink?> = pending.asStateFlow()

    /** An address the phone opened the app with. Anything the router ignores leaves the current state as it is. */
    fun open(url: String?) {
        router.open(url)?.let { pending.value = it }
    }

    fun dismiss() {
        pending.value = null
    }
}
