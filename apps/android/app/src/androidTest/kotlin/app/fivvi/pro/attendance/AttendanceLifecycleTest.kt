package app.fivvi.pro.attendance

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.auth.KeystoreSessionStore
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.core.signin.SignInTags
import app.fivvi.pro.DefaultAppDependencies
import app.fivvi.pro.FivviApplication
import app.fivvi.pro.classes.ClassDateTags
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.localizedString
import app.fivvi.pro.personal.ProTab
import app.fivvi.pro.personal.TodayTags
import app.fivvi.pro.waitUntilTagExists
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F025 (spec #460) on the real activity, in nl-NL and en: the language switched while TD-02 or CO-05 is open (#1619), and the
// sign-out with taps still waiting (#1618): it warns first and then empties the queue.
@RunWith(Parameterized::class)
class AttendanceLifecycleTest(@Suppress("UNUSED_PARAMETER") tag: String, language: AppLanguage) :
    AttendanceFlowBase(language) {
    private val other = AppLanguage.entries.first { it != language }

    // What a language change does to a screen that is open: the app's choice is published and the screens read the catalog again.
    private fun switchLanguage() {
        val app = ApplicationProvider.getApplicationContext<FivviApplication>()
        compose.runOnUiThread { app.dependencies.languagePreference.choose(other) }
    }

    private fun inOther(id: Int, vararg args: Any) = localizedString(other, id, *args)

    @Test
    fun test_F025_1619_td02ReadsInTheNewLanguageWhenTheLanguageChangesWhileItIsOpen() {
        AttendanceFixtures.addAnna(sessions, anna)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        openAnna()
        compose.waitUntilTagExists(AttendanceSectionTags.TITLE)
        compose.onNodeWithTag(AttendanceSectionTags.TITLE).assertTextEquals(string(R.string.attendance_title))

        switchLanguage()

        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag(AttendanceSectionTags.TITLE).assertTextEquals(inOther(R.string.attendance_title))
            }.isSuccess
        }
        val attended = AttendanceSectionTags.segment(anna.id, AttendanceStatus.ATTENDED)
        compose.onNodeWithTag(attended).assertTextEquals(inOther(R.string.attendance_status_attended))
        compose.onNodeWithTag(AttendanceSectionTags.segment(anna.id, AttendanceStatus.NO_SHOW))
            .assertTextEquals(inOther(R.string.attendance_status_no_show))
    }

    @Test
    fun test_F025_1619_co05ReadsInTheNewLanguageWhenTheLanguageChangesWhileItIsOpen() {
        AttendanceFixtures.addKracht(sessions, opensAt = AttendanceFixtures.at("19:00"))
        launch(AttendanceFixtures.at("18:10"))
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.kracht))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.kracht)).performClick()
        compose.waitUntilTagExists(ClassDateTags.TAKE_ATTENDANCE)
        compose.onNodeWithTag(ClassDateTags.TAKE_ATTENDANCE).performScrollTo().performClick()
        compose.waitUntilTagExists(AttendanceTags.TOO_EARLY)
        compose.onNodeWithTag(AttendanceTags.TOO_EARLY).assertTextEquals(string(R.string.attendance_too_early, "19:00"))

        switchLanguage()

        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag(
                    AttendanceTags.TOO_EARLY,
                ).assertTextEquals(inOther(R.string.attendance_too_early, "19:00"))
            }.isSuccess
        }
        compose.onNodeWithTag(AttendanceTags.TITLE).assertTextEquals(inOther(R.string.attendance_title))
        compose.onNodeWithTag(AttendanceTags.EVERYONE).assertTextEquals(inOther(R.string.attendance_everyone))
        compose.waitForDescription(AttendanceTags.SUMMARY, inOther(R.string.attendance_summary, "0", "0", "7"))
    }

    @Test
    fun test_F025_1618_signingOutWithTapsWaitingWarnsFirstThenEmptiesTheQueue() {
        AttendanceFixtures.addKracht(sessions)
        val offline = FakeConnectivity(false)
        launch(AttendanceFixtures.at("18:10"), offline)
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.kracht))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.kracht)).performClick()
        compose.waitUntilTagExists(ClassDateTags.TAKE_ATTENDANCE)
        compose.onNodeWithTag(ClassDateTags.TAKE_ATTENDANCE).performScrollTo().performClick()
        compose.waitUntilTagExists(AttendanceTags.TITLE)
        compose.onNodeWithTag(
            AttendanceTags.button(id("Anna de Vries"), AttendanceStatus.ATTENDED),
        ).performScrollTo().performClick()
        compose.onNodeWithTag(
            AttendanceTags.button(id("Bram Jansen"), AttendanceStatus.NO_SHOW),
        ).performScrollTo().performClick()
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(1, 1, 5))
        assertNotNull("the taps are kept on the phone", queueFile.read("attendance-queue.json"))
        app.pressBack()
        app.pressBack()

        compose.waitUntilTagExists(ProTab.HOME.tag)
        compose.onNodeWithTag(ProTab.HOME.tag).performClick()
        compose.waitUntilTagExists(HomeTags.SIGN_OUT)
        compose.onNodeWithTag(HomeTags.SIGN_OUT).performScrollTo().performClick()

        // The warning names how many taps are lost; *Annuleren* keeps them.
        compose.waitUntilTagExists(HomeTags.SIGN_OUT_CONFIRM)
        compose.onNodeWithTag(
            HomeTags.SIGN_OUT_CONFIRM,
        ).assertTextEquals(string(R.string.attendance_app_sign_out_confirm))
        compose.onNodeWithTag(HomeTags.SIGN_OUT_CANCEL).performClick()
        compose.waitFor { compose.noNode(HomeTags.SIGN_OUT_CONFIRM) }
        assertNotNull(queueFile.read("attendance-queue.json"))

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performScrollTo().performClick()
        compose.waitUntilTagExists(HomeTags.SIGN_OUT_CONFIRM)
        signInApi.answerSignedOut()
        compose.onNodeWithTag(HomeTags.SIGN_OUT_CONFIRM).performClick()

        compose.waitUntilTagExists(SignInTags.EMAIL)
        assertNull("what waited is gone from the phone", queueFile.read("attendance-queue.json"))
        assertTrue("and was never sent", server.sent.isEmpty())
    }

    @Test
    fun test_F025_1618_signingOutWithNothingWaitingAsksNothing() {
        AttendanceFixtures.addKracht(sessions)
        launch(AttendanceFixtures.at("18:10"), startOnHome = true)
        compose.waitUntilTagExists(HomeTags.SIGN_OUT)
        signInApi.answerSignedOut()

        compose.onNodeWithTag(HomeTags.SIGN_OUT).performScrollTo().performClick()

        compose.waitUntilTagExists(SignInTags.EMAIL)
        assertTrue(compose.onAllNodes(hasTestTag(HomeTags.SIGN_OUT_CONFIRM)).fetchSemanticsNodes().isEmpty())
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

// F025 #1618: the queue is kept apart from what the personal screens keep, so a token the API rejects (which clears those)
// leaves the taps waiting for the same account, and only the sign-out the person chose, after the warning, empties them.
class AttendanceQueueFileTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var dependencies: DefaultAppDependencies

    @org.junit.Before
    fun setUp() {
        KeystoreSessionStore(context).delete()
        dependencies = DefaultAppDependencies(context)
        dependencies.attendanceStore.clear()
        dependencies.personalStore.clear()
    }

    @After
    fun tearDown() {
        KeystoreSessionStore(context).delete()
        dependencies.attendanceStore.clear()
    }

    @Test
    fun test_F025_1618_aRejectedTokenLeavesTheTapsOnThePhoneButClearsWhatVandaagKept() {
        dependencies.session.signIn("token-1")
        dependencies.attendanceStore.write("attendance-queue.json", "[]".encodeToByteArray())
        dependencies.personalStore.write("day.json", "{}".encodeToByteArray())

        dependencies.session.expire("token-1")

        assertNotNull(dependencies.attendanceStore.read("attendance-queue.json"))
        assertNull(dependencies.personalStore.read("day.json"))
    }

    @Test
    fun test_F025_theQueueFileIsInAFolderTheBackupRulesLeaveOut() {
        dependencies.attendanceStore.write("attendance-queue.json", "[]".encodeToByteArray())

        val file = java.io.File(
            java.io.File(context.filesDir, app.fivvi.pro.ATTENDANCE_DIRECTORY),
            "attendance-queue.json",
        )

        assertTrue("a file of the app, in the folder the backup rules leave out", file.isFile)
        assertFalse(java.io.File(context.filesDir, "personal/attendance-queue.json").exists())
        assertEquals("[]", file.readText())
    }
}
