package app.fivvi.pro.personal

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.fivvi.core.auth.KeystoreSessionStore
import app.fivvi.pro.DefaultAppDependencies
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// F013 AC7: what Vandaag keeps for its offline view is a file of the app, and it goes with the sign-in it was read in: with a
// sign-out, and with a token the API stopped accepting.
class PersonalSignOutTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var dependencies: DefaultAppDependencies

    @Before
    fun setUp() {
        KeystoreSessionStore(context).delete()
        dependencies = DefaultAppDependencies(context)
        dependencies.personalStore.clear()
    }

    @After
    fun tearDown() {
        KeystoreSessionStore(context).delete()
        dependencies.personalStore.clear()
    }

    private fun keepADay() {
        PersonalCache(dependencies.personalStore).day =
            PersonalCache.Day(PersonalFixtures.sarah(), PersonalFixtures.now)
    }

    @Test
    fun test_F013_AC7_theDayIsKeptInTheAppsPrivateFiles() {
        keepADay()

        val file = File(File(context.filesDir, PersonalStore.DIRECTORY), "day.json")
        assertTrue("a file of the app, in the folder the backup rules leave out", file.isFile)
        assertEquals(PersonalFixtures.DAY, PersonalCache(dependencies.personalStore).day?.day?.date)
    }

    @Test
    fun test_F013_AC7_aSignOutForgetsTheDay() {
        dependencies.session.signIn("token-1")
        keepADay()

        dependencies.session.signedOut()

        assertNull(PersonalCache(dependencies.personalStore).day)
        assertFalse(File(context.filesDir, PersonalStore.DIRECTORY).exists())
    }

    @Test
    fun test_F013_AC7_aRejectedTokenForgetsTheDay() {
        dependencies.session.signIn("token-1")
        keepADay()

        dependencies.session.expire("token-1")

        assertNull(PersonalCache(dependencies.personalStore).day)
    }
}
