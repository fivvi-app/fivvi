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

    @Test
    fun F001N_AC9_aRejectedTokenSignsOutWithTheNotice() {
        val session = Session(InMemorySessionStore("old"))

        session.expire("old")

        assertEquals(true, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC9_aNewSignInHasNoNotice() {
        val session = Session(InMemorySessionStore("old"))
        session.expire("old")

        session.signIn("new")

        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_detachingTheTokenDeletesItButTheScreenStaysUntilSignedOut() {
        val store = InMemorySessionStore("tok")
        val session = Session(store)
        val generation = session.state.value.generation

        val detached = session.detachToken()

        assertEquals("tok", detached)
        assertNull(store.read())
        assertNull(session.token())
        assertEquals(AuthState(signedIn = true, generation = generation), session.state.value)
    }

    @Test
    fun F001N_AC10_detachingWithoutATokenGivesNone() {
        assertNull(Session(InMemorySessionStore()).detachToken())
    }

    @Test
    fun F001N_AC10_signedOutShowsSignInWithoutNotice() {
        val session = Session(InMemorySessionStore("tok"))
        session.detachToken()

        session.signedOut()

        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signedOutAfterARefusedSignOutShowsTheNotice() {
        val session = Session(InMemorySessionStore("tok"))
        session.detachToken()

        session.signedOut(afterRejection = true)

        assertEquals(true, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signedOutKeepsTheNoticeOfARejectedToken() {
        val session = Session(InMemorySessionStore("tok"))
        session.expire("tok")
        val state = session.state.value

        session.signedOut()

        assertEquals(state, session.state.value)
    }

    @Test
    fun F001N_AC9_aLateAnswerForADetachedTokenChangesNothing() {
        val session = Session(InMemorySessionStore("old"))
        session.detachToken()
        val state = session.state.value

        session.expire("old")

        assertEquals(state, session.state.value)
    }

    // F001 AC3 (#266): every way out of a sign-in tells the app to clear the error-reporting user, once.
    @Test
    fun F001N_266_AC3_aRejectedTokenClearsTheReportingUser() {
        var clears = 0
        val session = Session(InMemorySessionStore("old"), onSignedOut = { clears++ })

        session.expire("old")

        assertEquals(1, clears)
    }

    @Test
    fun F001N_266_AC3_signingOutClearsTheReportingUserOnce() {
        var clears = 0
        val session = Session(InMemorySessionStore("old"), onSignedOut = { clears++ })

        session.signedOut()
        session.signedOut()

        assertEquals(1, clears)
    }

    @Test
    fun F001N_266_AC3_aLateAnswerToAnOldTokenKeepsTheReportingUser() {
        var clears = 0
        val session = Session(InMemorySessionStore("old"), onSignedOut = { clears++ })
        session.signIn("new")

        session.expire("old")

        assertEquals(0, clears)
    }
}
