package app.fivvi.client

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** A [Connectivity] a test switches: [setOnline] is the phone gaining or losing its connection. */
class FakeConnectivity(online: Boolean = true) : Connectivity {
    private val _online = MutableStateFlow(online)
    override val online: StateFlow<Boolean> = _online.asStateFlow()

    fun setOnline(online: Boolean) {
        _online.value = online
    }
}
