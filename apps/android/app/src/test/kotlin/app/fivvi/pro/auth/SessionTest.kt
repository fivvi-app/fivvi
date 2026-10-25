package app.fivvi.pro.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionTest {
    @Test
    fun F001N_AC13_noTokenShowsSignIn() {
        val session = Session(InMemorySessionStore())

        assertEquals(false, session.state.value.signedIn)
        assertNull(session.token())
    }

    @Test
    fun F001N_AC8_storedTokenOpensHome() {
        val session = Session(InMemorySessionStore("stored"))

        assertEquals(true, session.state.value.signedIn)
        assertEquals("stored", session.token())
    }

    @Test
    fun F001N_AC3_signInStoresTheToken() {
        val store = InMemorySessionStore()
        val session = Session(store)

        session.signIn("fresh")

        assertEquals("fresh", store.read())
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC9_expireDeletesTheTokenAndSignsOut() {
        val store = InMemorySessionStore("old")
        val session = Session(store)

        session.expire("old")

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC9_aLateAnswerToAnOldTokenDoesNotSignOutANewSignIn() {
        val store = InMemorySessionStore("old")
        val session = Session(store)
        session.signIn("new")

        session.expire("old")

        assertEquals("new", store.read())
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC3_everySignInAndSignOutIsANewGeneration() {
        val session = Session(InMemorySessionStore())
        val first = session.state.value.generation

        session.signIn("a")
        val second = session.state.value.generation
        session.expire("a")

        assertEquals(true, first < second)
        assertEquals(true, second < session.state.value.generation)
    }
}
