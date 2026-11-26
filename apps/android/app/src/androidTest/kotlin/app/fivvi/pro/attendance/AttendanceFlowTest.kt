package app.fivvi.pro.attendance

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.AppRule
import app.fivvi.pro.attendance.AttendanceFixtures.JOHNS_GYM
import app.fivvi.pro.classes.ClassDateTags
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.personal.PersonalFixtures
import app.fivvi.pro.personal.ProTab
import app.fivvi.pro.personal.TodayTags
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.SessionTags
import app.fivvi.pro.sessions.trainerIdOf
import app.fivvi.pro.waitUntilTagExists
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F025 (spec #460), TD-02's *Aanwezigheid* section, TD-03's *Aanwezigheid invullen* and CO-05 through the whole app, in nl-NL and en.
@RunWith(Parameterized::class)
class AttendanceFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, language: AppLanguage) :
    AttendanceFlowBase(language) {
    private fun segment(status: AttendanceStatus) = AttendanceSectionTags.segment(anna.id, status)

    @Test
    fun test_F025_AC1_markPrivateSessionAttended() {
        AttendanceFixtures.addAnna(sessions, anna)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        openAnna()
        compose.waitUntilTagExists(segment(AttendanceStatus.ATTENDED))

        compose.onNodeWithTag(AttendanceSectionTags.TITLE).assertTextEquals(string(R.string.attendance_title))
        compose.onNodeWithTag(
            segment(AttendanceStatus.ATTENDED),
        ).assertTextEquals(string(R.string.attendance_status_attended))
        compose.onNodeWithTag(segment(AttendanceStatus.ATTENDED)).performClick()

        compose.waitFor { server.sent.size == 1 }
        compose.waitFor { compose.noNode(segment(AttendanceStatus.ATTENDED)).not() }
        compose.onNodeWithTag(segment(AttendanceStatus.ATTENDED)).assertIsSelected()
        compose.onNodeWithTag(segment(AttendanceStatus.BOOKED)).assertIsNotSelected()
        assertEquals(SetAttendanceRequest.Status.ATTENDED, server.sent.single().status)
        assertEquals("the app says which of the two it is", "android", server.sent.single().surface)

        // And back: choosing Geboekt sets it back, a second request.
        compose.onNodeWithTag(segment(AttendanceStatus.BOOKED)).performClick()
        compose.waitFor { server.sent.size == 2 }
        compose.waitFor {
            runCatching { compose.onNodeWithTag(segment(AttendanceStatus.BOOKED)).assertIsSelected() }.isSuccess
        }
        assertEquals(SetAttendanceRequest.Status.BOOKED, server.sent.last().status)
        assertEquals(
            AttendanceParticipant.Status.BOOKED,
            server.sessions.getValue(AttendanceFixtures.annaSession).participants.single().status,
        )
    }

    @Test
    fun test_F025_design_td02ShowsTheSegmentedControlOffWithTheTimeBeforeTheWindow() {
        AttendanceFixtures.addAnna(sessions, anna, opensAt = AttendanceFixtures.at("08:30"))
        launch(AttendanceFixtures.at("08:00"), day = annaDay(open = false))
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.annaSession))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.annaSession)).performClick()
        compose.waitUntilTagExists(AttendanceSectionTags.NOTE)

        compose.onNodeWithTag(
            AttendanceSectionTags.NOTE,
        ).assertTextEquals(string(R.string.attendance_app_from, "08:30"))
        for (status in listOf(AttendanceStatus.BOOKED, AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW)) {
            compose.onNodeWithTag(segment(status)).assertIsNotEnabled()
        }
        compose.onNodeWithTag(segment(AttendanceStatus.BOOKED)).assertIsSelected()
        assertTrue("a disabled control sends nothing", server.sent.isEmpty())
    }

    @Test
    fun test_F025_design_td02OnACancelledSessionSaysCancelled() {
        AttendanceFixtures.addAnna(sessions, anna, cancelled = true)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        openAnna()
        compose.waitUntilTagExists(AttendanceSectionTags.NOTE)

        compose.onNodeWithTag(AttendanceSectionTags.NOTE).assertTextEquals(string(R.string.attendance_app_cancelled))
        compose.onNodeWithTag(segment(AttendanceStatus.ATTENDED)).assertIsNotEnabled()
    }

    @Test
    fun test_F025_design_theSegmentsAreAtLeast48dpHighWithACheckOnTheSelectedOne() {
        AttendanceFixtures.addAnna(sessions, anna)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        openAnna()
        compose.waitUntilTagExists(segment(AttendanceStatus.ATTENDED))

        for (status in listOf(AttendanceStatus.BOOKED, AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW)) {
            compose.onNodeWithTag(segment(status)).assertHeightIsAtLeast(48.dp)
        }
        compose.onNodeWithTag(segment(AttendanceStatus.BOOKED)).assertIsSelected()
        compose.onNodeWithTag(segment(AttendanceStatus.ATTENDED)).assertIsEnabled()
    }

    // MARK: CO-05

    private fun openCo05() {
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.kracht))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.kracht)).performClick()
        compose.waitUntilTagExists(ClassDateTags.TAKE_ATTENDANCE)
        compose.onNodeWithTag(ClassDateTags.TAKE_ATTENDANCE).performScrollTo().performClick()
        compose.waitUntilTagExists(AttendanceTags.TITLE)
    }

    private fun tap(name: String, status: AttendanceStatus) =
        compose.onNodeWithTag(AttendanceTags.button(id(name), status)).performScrollTo().performClick()

    @Test
    fun test_F025_AC4_classAttendanceSummaryUpdates() {
        AttendanceFixtures.addKracht(sessions)
        launch(AttendanceFixtures.at("18:10"))
        openCo05()
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
        compose.onNodeWithTag(AttendanceTags.SUBTITLE).assertTextEquals(
            string(
                R.string.attendance_app_subtitle,
                if (language ==
                    AppLanguage.DUTCH
                ) {
                    "Kracht"
                } else {
                    "Strength"
                },
                "19:00",
                "18:00",
            ),
        )

        AttendanceFixtures.names.take(5).forEachIndexed { index, name ->
            tap(name, AttendanceStatus.ATTENDED)
            compose.waitForDescription(AttendanceTags.SUMMARY, summary(index + 1, 0, 6 - index))
        }
        tap("Fenna Kok", AttendanceStatus.NO_SHOW)
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(5, 1, 1))

        compose.waitFor { server.sent.size == 6 }
        assertEquals(6, server.sent.map { it.requestId }.toSet().size)
        assertEquals(setOf("android"), server.sent.map { it.surface }.toSet())
        compose.onNodeWithTag(AttendanceTags.button(id("Anna de Vries"), AttendanceStatus.ATTENDED)).assertIsSelected()
        // The selected one again takes it back.
        tap("Anna de Vries", AttendanceStatus.ATTENDED)
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(4, 1, 2))
    }

    @Test
    fun test_F025_AC5_beforeTheWindowTheButtonsAreOffWithTheTime() {
        AttendanceFixtures.addKracht(sessions)
        launch(AttendanceFixtures.at("17:20"))
        openCo05()
        compose.waitUntilTagExists(AttendanceTags.TOO_EARLY)

        compose.onNodeWithTag(AttendanceTags.TOO_EARLY).assertTextEquals(string(R.string.attendance_too_early, "17:30"))
        compose.onNodeWithTag(AttendanceTags.EVERYONE).assertIsNotEnabled()
        compose.onNodeWithTag(
            AttendanceTags.button(id("Anna de Vries"), AttendanceStatus.ATTENDED),
        ).assertIsNotEnabled()
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
        assertTrue(server.sent.isEmpty())
    }

    @Test
    fun test_F025_AC6_cancelledClassNeedsNoAttendance() {
        AttendanceFixtures.addKracht(sessions)
        launch(AttendanceFixtures.at("18:10"))
        openCo05()
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))

        // John cancels the class while CO-05 is open; the app comes to the front again and reads it.
        server.sessions.getValue(AttendanceFixtures.kracht).cancelled = true
        app.backgroundAndForeground()

        compose.waitUntilTagExists(AttendanceTags.CANCELLED)
        compose.onNodeWithTag(AttendanceTags.CANCELLED).assertTextEquals(string(R.string.attendance_cancelled_class))
        assertTrue("a cancelled class has no Iedereen aanwezig", compose.noNode(AttendanceTags.EVERYONE))
        assertTrue(
            "and no buttons",
            compose.noNode(AttendanceTags.button(id("Anna de Vries"), AttendanceStatus.ATTENDED)),
        )
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
    }

    @Test
    fun test_F025_AC6_td03OfACancelledDateHasNoAttendanceButton() {
        AttendanceFixtures.addKracht(sessions, cancelled = true)
        launch(
            AttendanceFixtures.at("18:10"),
            day = AttendanceFixtures.day(AttendanceFixtures.krachtItem(cancelled = true)),
        )
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.kracht))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.kracht)).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCELLED)

        assertTrue(compose.noNode(ClassDateTags.TAKE_ATTENDANCE))
    }

    @Test
    fun test_F025_AC6_aParticipantWhoCancelledIsReadOnly() {
        AttendanceFixtures.addKracht(sessions, statuses = mapOf("Gijs" to AttendanceParticipant.Status.CANCELLED))
        launch(AttendanceFixtures.at("18:10"))
        openCo05()
        compose.waitUntilTagExists(AttendanceTags.row(id("Gijs Mol")))

        assertTrue(compose.noNode(AttendanceTags.button(id("Gijs Mol"), AttendanceStatus.ATTENDED)))
        compose.onNodeWithTag(AttendanceTags.line(id("Gijs Mol")), useUnmergedTree = true)
            .assertTextEquals(string(R.string.attendance_status_cancelled))
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 6))
    }

    @Test
    fun test_F025_iedereenAanwezigMarksEveryOpenParticipantAndAnnaStaysNoShow() {
        AttendanceFixtures.addKracht(sessions, statuses = mapOf("Anna" to AttendanceParticipant.Status.NO_SHOW))
        launch(AttendanceFixtures.at("18:10"))
        openCo05()
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 1, 6))

        compose.onNodeWithTag(AttendanceTags.EVERYONE).assertTextEquals(string(R.string.attendance_everyone))
        compose.onNodeWithTag(AttendanceTags.EVERYONE).performScrollTo().performClick()

        compose.waitForDescription(AttendanceTags.SUMMARY, summary(6, 1, 0))
        compose.waitFor { server.sent.size == 1 }
        assertEquals("one request, with no participant of its own", null, server.sent.single().clientId)
        compose.onNodeWithTag(AttendanceTags.button(id("Anna de Vries"), AttendanceStatus.NO_SHOW)).assertIsSelected()
        compose.onNodeWithTag(AttendanceTags.button(id("Bram Jansen"), AttendanceStatus.ATTENDED)).assertIsSelected()
        compose.onNodeWithTag(AttendanceTags.EVERYONE).assertIsNotEnabled()
    }

    @Test
    fun test_F025_AC8_offlineQueueSurvivesRestartAndSyncsInOrder() {
        AttendanceFixtures.addKracht(sessions)
        val offline = FakeConnectivity(false)
        launch(AttendanceFixtures.at("18:10"), offline)
        openCo05()
        val three = AttendanceFixtures.names.take(3)
        three.forEach { tap(it, AttendanceStatus.ATTENDED) }

        compose.waitForDescription(AttendanceTags.SUMMARY, summary(3, 0, 4))
        three.forEach {
            compose.onNodeWithTag(AttendanceTags.line(id(it)), useUnmergedTree = true)
                .assertTextEquals(string(R.string.attendance_app_waiting))
        }
        assertTrue("nothing is sent offline", server.sent.isEmpty())

        // The app is closed and opened again, online this time: the same taps are still waiting, and go in order.
        app.close()
        launch(AttendanceFixtures.at("18:10"), FakeConnectivity(true))
        compose.waitFor { server.sent.size == 3 }

        assertEquals(three.map(::id), server.sent.map { it.clientId })
        assertEquals(3, server.sent.map { it.requestId }.toSet().size)
    }

    @Test
    fun test_F025_AC9_refusedQueuedTapReverts() {
        AttendanceFixtures.addKracht(sessions)
        val phone = FakeConnectivity(false)
        launch(AttendanceFixtures.at("18:10"), phone)
        openCo05()
        tap("Anna de Vries", AttendanceStatus.ATTENDED)
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(1, 0, 6))

        // John cancelled the class meanwhile.
        server.sessions.getValue(AttendanceFixtures.kracht).cancelled = true
        phone.setOnline(true)

        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
        compose.waitUntilTagExists(AttendanceTags.CANCELLED)
        compose.onNodeWithTag(AttendanceTags.CANCELLED).assertTextEquals(string(R.string.attendance_cancelled_class))
    }

    @Test
    fun test_F025_iedereenAanwezigOfflineIsOneQueuedRequestThatRevertsWhenRefused() {
        AttendanceFixtures.addKracht(sessions)
        val phone = FakeConnectivity(false)
        launch(AttendanceFixtures.at("18:10"), phone)
        openCo05()
        tap("Anna de Vries", AttendanceStatus.ATTENDED)
        tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(1, 1, 5))
        compose.onNodeWithTag(AttendanceTags.EVERYONE).performScrollTo().performClick()

        compose.waitForDescription(AttendanceTags.SUMMARY, summary(6, 1, 0))
        compose.onNodeWithTag(AttendanceTags.line(id("Chris Bakker")), useUnmergedTree = true)
            .assertTextEquals(string(R.string.attendance_app_waiting))
        compose.onNodeWithTag(AttendanceTags.button(id("Bram Jansen"), AttendanceStatus.NO_SHOW)).assertIsSelected()

        server.sessions.getValue(AttendanceFixtures.kracht).cancelled = true
        phone.setOnline(true)

        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
        assertEquals("the two taps first, then one request for everyone", 3, server.sent.size)
        assertEquals(null, server.sent.last().clientId)
    }

    @Test
    fun test_F025_AC4_td03OpensCo05AndBackIsTd03() {
        AttendanceFixtures.addKracht(sessions)
        launch(AttendanceFixtures.at("18:10"))
        openCo05()
        app.pressBack()

        compose.waitUntilTagExists(ClassDateTags.TAKE_ATTENDANCE)
        compose.onNodeWithTag(ClassDateTags.TAKE_ATTENDANCE).assertTextEquals(string(R.string.attendance_app_take))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
