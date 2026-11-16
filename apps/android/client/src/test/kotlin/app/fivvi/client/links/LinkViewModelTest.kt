package app.fivvi.client.links

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// E017 #506: a link waits in the view model through the sign-in, and only a link the router accepts is kept.
class LinkViewModelTest {
    @Test
    fun E017_AC6_aJoinLinkIsKeptUntilItIsDismissed() {
        val model = LinkViewModel()
        assertNull(model.link.value)

        model.open("https://fivvi.app/j/ABCD2345")

        assertEquals(LinkDestination.Join("ABCD2345"), model.link.value?.destination)
        assertEquals("https://fivvi.app/j/ABCD2345", model.link.value?.url)

        model.dismiss()

        assertNull(model.link.value)
    }

    @Test
    fun E017_AC6_aLinkTheRouterIgnoresChangesNothing() {
        val model = LinkViewModel()
        model.open("https://fivvi.app/i/tok-1")

        model.open("https://fivvi.app/privacy")
        model.open(null)
        model.open("https://example.com/j/ABCD2345")

        assertEquals(LinkDestination.Invitation("tok-1"), model.link.value?.destination)
    }

    @Test
    fun E017_AC6_aLaterLinkReplacesTheEarlierOne() {
        val model = LinkViewModel()
        model.open("https://fivvi.app/j/ABCD2345")

        model.open("https://fivvi.app/i/tok-1")

        assertEquals(LinkDestination.Invitation("tok-1"), model.link.value?.destination)
    }
}
