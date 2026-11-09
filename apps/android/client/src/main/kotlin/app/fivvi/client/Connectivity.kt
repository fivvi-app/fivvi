package app.fivvi.client

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Whether the phone has a working connection: the shell shows the offline banner while it hasn't (E017 AC9). */
interface Connectivity {
    val online: StateFlow<Boolean>
}

/** The phone's default network, through `ConnectivityManager`: online while it is validated (it reaches the internet). */
class AndroidConnectivity(context: Context) : Connectivity {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(isValidated(manager.getNetworkCapabilities(manager.activeNetwork)))
    override val online: StateFlow<Boolean> = _online.asStateFlow()

    init {
        manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                _online.value = isValidated(capabilities)
            }

            override fun onLost(network: Network) {
                _online.value = false
            }
        })
    }

    private fun isValidated(capabilities: NetworkCapabilities?) =
        capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
}
