package app.fivvi.client.links

import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// E017 #506: a link waits in the view model through the sign-in, and only a link the router accepts is kept.
class LinkViewModelTest {
    @Test
    fun E017_AC6_aJoinLinkIsKeptUntilItIsDismissed() {
        val model = LinkViewModel(SavedStateHandle())
        assertNull(model.link.value)

        model.open("https://fivvi.app/j/ABCD2345")

        assertEquals(LinkDestination.Join("ABCD2345"), model.link.value?.destination)
        assertEquals("https://fivvi.app/j/ABCD2345", model.link.value?.url)

        model.dismiss()

        assertNull(model.link.value)
    }

    @Test
    fun E017_AC6_aLinkTheRouterIgnoresChangesNothing() {
        val model = LinkViewModel(SavedStateHandle())
        model.open("https://fivvi.app/i/tok-1")

        model.open("https://fivvi.app/privacy")
        model.open(null)
        model.open("https://example.com/j/ABCD2345")

        assertEquals(LinkDestination.Invitation("tok-1"), model.link.value?.destination)
    }

    @Test
    fun E017_AC6_aLaterLinkReplacesTheEarlierOne() {
        val model = LinkViewModel(SavedStateHandle())
        model.open("https://fivvi.app/j/ABCD2345")

        model.open("https://fivvi.app/i/tok-1")

        assertEquals(LinkDestination.Invitation("tok-1"), model.link.value?.destination)
    }

    // The system kills the process while the app waits in the background: the activity and the model are rebuilt from the
    // saved state, and the link must still be there (the intent is not read again after a restore).
    @Test
    fun E017_AC6_theLinkSurvivesTheProcessBeingKilled() {
        val before = SavedStateHandle()
        LinkViewModel(before).open("https://fivvi.app/j/ABCD2345")
        val restored = SavedStateHandle(before.keys().associateWith { before.get<Any>(it) })

        val after = LinkViewModel(restored)

        assertEquals(LinkDestination.Join("ABCD2345"), after.link.value?.destination)
        assertEquals("https://fivvi.app/j/ABCD2345", after.link.value?.url)
    }

    @Test
    fun E017_AC6_aDismissedLinkIsNotRestored() {
        val before = SavedStateHandle()
        val model = LinkViewModel(before)
        model.open("https://fivvi.app/j/ABCD2345")
        model.dismiss()

        val after = LinkViewModel(SavedStateHandle(before.keys().associateWith { before.get<Any>(it) }))

        assertNull(after.link.value)
    }
}
