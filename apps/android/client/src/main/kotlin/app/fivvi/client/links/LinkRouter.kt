package app.fivvi.client.links

import java.net.URI
import java.net.URISyntaxException

/** Where an opened link goes. F029 and F032 register their screens against these; until then both show the placeholder. */
sealed interface LinkDestination {
    /** The workspace's join link, `https://fivvi.app/j/{code}` (F029). */
    data class Join(val code: String) : LinkDestination

    /** A client invitation, `https://fivvi.app/i/{token}` (F032). */
    data class Invitation(val token: String) : LinkDestination
}

/** A link the phone handed to the app: the [url] as opened (for *Openen in de browser*) and where it goes. */
data class OpenedLink(val url: String, val destination: LinkDestination)

/**
 * The one entry point for links into the app (E017 #506, AC6): [open] maps `https://fivvi.app/j/{code}` and
 * `https://fivvi.app/i/{token}` to their [LinkDestination] with the code or token passed on, and ignores everything else
 * (other paths, other hosts, other schemes) by answering `null`. The manifest's verified filter lets only those two paths
 * through; this keeps the rule in code, for a link that arrives another way.
 */
class LinkRouter {
    fun open(url: String?): OpenedLink? {
        val uri = url?.let(::parse) ?: return null
        val ours = uri.scheme == "https" && uri.host?.lowercase() == HOST && uri.port == -1 && uri.rawUserInfo == null
        if (!ours) return null
        val segments = uri.rawPath.orEmpty().removeSuffix("/").split('/')
        // "/j/ABCD2345" splits into ["", "j", "ABCD2345"]: exactly one value after the kind.
        if (segments.size != 3 || segments[0].isNotEmpty() || segments[2].isEmpty()) return null
        val value = segments[2]
        val destination = when (segments[1]) {
            "j" -> LinkDestination.Join(value)
            "i" -> LinkDestination.Invitation(value)
            else -> return null
        }
        return OpenedLink(url, destination)
    }

    private fun parse(url: String): URI? = try {
        URI(url)
    } catch (_: URISyntaxException) {
        null
    }

    private companion object {
        const val HOST = "fivvi.app"
    }
}
