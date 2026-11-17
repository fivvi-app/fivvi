package app.fivvi.client.links

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// E017 #506, AC6: the join link and the invitation link of fivvi.app open the link screen with the code or token passed on;
// every other address is ignored.
class LinkRouterTest {
    private val router = LinkRouter()

    @Test
    fun E017_AC6_joinAndInvitationLinksRouteToTheirScreens() {
        assertEquals(
            OpenedLink("https://fivvi.app/j/ABCD2345", LinkDestination.Join("ABCD2345")),
            router.open("https://fivvi.app/j/ABCD2345"),
        )
        assertEquals(
            OpenedLink("https://fivvi.app/i/tok_4f9-x", LinkDestination.Invitation("tok_4f9-x")),
            router.open("https://fivvi.app/i/tok_4f9-x"),
        )
    }

    @Test
    fun E017_AC6_aQueryAFragmentATrailingSlashAndTheHostCaseDoNotChangeTheRoute() {
        assertEquals(
            LinkDestination.Join("ABCD2345"),
            router.open("https://FIVVI.app/j/ABCD2345/?utm_source=qr#top")?.destination,
        )
    }

    @Test
    fun E017_AC6_otherPathsAreIgnored() {
        listOf(
            "https://fivvi.app/",
            "https://fivvi.app/j",
            "https://fivvi.app/j/",
            "https://fivvi.app/i/",
            "https://fivvi.app/j/ABCD2345/extra",
            "https://fivvi.app/J/ABCD2345",
            "https://fivvi.app/jabcd",
            "https://fivvi.app/en/j/ABCD2345",
            "https://fivvi.app/account-verwijderen",
            "https://fivvi.app/api/v1/me",
            "https://fivvi.app/.well-known/assetlinks.json",
        ).forEach { assertNull(it, router.open(it)) }
    }

    @Test
    fun E017_AC6_otherHostsAndSchemesAreIgnored() {
        listOf(
            "https://example.com/j/ABCD2345",
            "https://www.fivvi.app/j/ABCD2345",
            "https://fivvi.app.example.com/j/ABCD2345",
            "https://evil.example@fivvi.app/j/ABCD2345",
            "https://fivvi.app@example.com/j/ABCD2345",
            "http://fivvi.app/j/ABCD2345",
            "app.fivvi://j/ABCD2345",
            "https://fivvi.app:8443/j/ABCD2345",
        ).forEach { assertNull(it, router.open(it)) }
    }

    @Test
    fun E017_AC6_noAddressAndNonsenseAreIgnored() {
        assertNull(router.open(null))
        assertNull(router.open(""))
        assertNull(router.open("not a url"))
        assertNull(router.open("https://fivvi.app/j/AB CD"))
    }

    // The code is Crockford base32 (8 characters), the invitation token base64url (43 characters): anything else in the
    // last segment is no code or token, so a crafted link never reaches a screen (or the browser button) as one.
    @Test
    fun E017_AC6_aCodeOrTokenWithOtherCharactersOrTooLongIsIgnored() {
        listOf(
            "https://fivvi.app/j/AB%20CD",
            "https://fivvi.app/j/AB.CD",
            "https://fivvi.app/j/AB+CD",
            "https://fivvi.app/j/AB%2FCD",
            "https://fivvi.app/j/%3Cscript%3E",
            "https://fivvi.app/i/tok;1",
            "https://fivvi.app/i/${"a".repeat(65)}",
            "https://fivvi.app/j/${"A".repeat(65)}",
        ).forEach { assertNull(it, router.open(it)) }
    }

    @Test
    fun E017_AC6_theLongestTokenAndAllAllowedCharactersAreKept() {
        val token = "Az09_-".repeat(10) + "abcd"
        assertEquals(64, token.length)
        assertEquals(LinkDestination.Invitation(token), router.open("https://fivvi.app/i/$token")?.destination)
    }

    // Opened again from the Recents list, Android hands the activity the intent that started it once more.
    @Test
    fun E017_AC6_aLinkIntentRelaunchedFromRecentsIsIgnored() {
        val view = "android.intent.action.VIEW"
        val url = "https://fivvi.app/j/ABCD2345"
        assertEquals(url, linkUrl(view, 0, url))
        assertNull(linkUrl(view, 0x00100000, url)) // FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY
        assertNull(linkUrl("android.intent.action.MAIN", 0, url))
        assertNull(linkUrl(view, 0, null))
    }
}
