package app.fivvi.pro.attendance

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.PersonalSessionClient
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.personal.NudgeTags
import app.fivvi.pro.personal.PersonalFixtures
import app.fivvi.pro.personal.StudioFixtures
import app.fivvi.pro.personal.StudioTags
import app.fivvi.pro.personal.TodayTags
import app.fivvi.pro.sessions.SessionTags
import app.fivvi.pro.waitUntilTagExists
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F025 (spec #460), the nudge on TD-01 *Vandaag* and the *Te doen* row of the *Mijn dag* card (AC2, #551), through the whole app,
// in nl-NL and en. Android has no swipe actions: the buttons are inline under the row.
@RunWith(Parameterized::class)
class AttendanceTodayFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, language: AppLanguage) :
    AttendanceFlowBase(language) {
    private val prefix = TodayTags.PREFIX
    private val session get() = AttendanceFixtures.annaSession

    private fun nudgeLine() = NudgeTags.line(prefix, session)

    private fun nudgeButton(status: AttendanceStatus) = NudgeTags.button(prefix, session, status)

    private fun waitForAnna() = compose.waitUntilTagExists(TodayTags.row(session))

    @Test
    fun test_F025_AC2_todayNudgeMarksNoShow() {
        AttendanceFixtures.addAnna(sessions, anna)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        waitForAnna()

        compose.waitUntilTagExists(nudgeLine())
        compose.onNodeWithTag(nudgeLine()).assertTextEquals(string(R.string.attendance_nudge))
        compose.onNodeWithTag(
            nudgeButton(AttendanceStatus.ATTENDED),
        ).assertTextEquals(string(R.string.attendance_status_attended))
        compose.onNodeWithTag(
            nudgeButton(AttendanceStatus.NO_SHOW),
        ).assertTextEquals(string(R.string.attendance_status_no_show))
        compose.onNodeWithTag(nudgeButton(AttendanceStatus.NO_SHOW)).assertHeightIsAtLeast(48.dp)

        // The API's day has no attendance to fill in for Anna once her no-show is stored.
        me.day = annaDay(open = false)
        compose.onNodeWithTag(nudgeButton(AttendanceStatus.NO_SHOW)).performClick()

        compose.waitFor { server.sent.size == 1 }
        assertEquals(SetAttendanceRequest.Status.NO_SHOW, server.sent.single().status)
        assertEquals(AttendanceFixtures.annaSession, server.sent.single().sessionId)
        compose.waitFor { compose.noNode(nudgeLine()) }
        assertTrue(compose.noNode(nudgeButton(AttendanceStatus.ATTENDED)))
        assertEquals(
            AttendanceParticipant.Status.NO_SHOW,
            server.sessions.getValue(AttendanceFixtures.annaSession).participants.single().status,
        )
    }

    @Test
    fun test_F025_AC2_noNudgeWhileTheSessionIsOn() {
        AttendanceFixtures.addAnna(sessions, anna)
        // 09:50: the API does not say attendanceOpen, so the row has no nudge and the card has nothing to do.
        launch(AttendanceFixtures.at("09:50"), day = annaDay(open = false))
        waitForAnna()

        assertTrue(compose.noNode(nudgeLine()))
        compose.waitUntilTagExists(TodayTags.CARD_TODO)
        compose.onNodeWithTag(TodayTags.CARD_TODO).assertTextEquals(string(R.string.attendance_app_caught_up))
    }

    @Test
    fun test_F025_design_theMijnDagCardListsTheSessionToFillInAndSaysAllCaughtUpOnceMarked() {
        AttendanceFixtures.addAnna(sessions, anna)
        launch(AttendanceFixtures.at("10:05"), day = annaDay())
        compose.waitUntilTagExists(TodayTags.todoChip(session))

        compose.onNodeWithTag(TodayTags.CARD_TODO).assertTextEquals(string(R.string.attendance_app_todo))
        compose.onNodeWithTag(
            TodayTags.todoChip(session),
        ).assertTextEquals(string(R.string.attendance_app_chip, "Anna", "09:00"))
        compose.onNodeWithTag(TodayTags.todoChip(session)).assertHeightIsAtLeast(48.dp)

        // The chip opens TD-02, where Anna is marked.
        compose.onNodeWithTag(TodayTags.todoChip(session)).performClick()
        compose.waitUntilTagExists(SessionTags.TITLE)
        compose.waitUntilTagExists(AttendanceSectionTags.segment(anna.id, AttendanceStatus.ATTENDED))
        me.day = annaDay(open = false)
        compose.onNodeWithTag(AttendanceSectionTags.segment(anna.id, AttendanceStatus.ATTENDED)).performClick()
        compose.waitFor { server.sent.size == 1 }
        app.pressBack()

        compose.waitUntilTagExists(TodayTags.CARD_TODO)
        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag(TodayTags.CARD_TODO).assertTextEquals(string(R.string.attendance_app_caught_up))
            }
                .isSuccess
        }
        assertTrue(compose.noNode(TodayTags.todoChip(session)))
    }

    @Test
    fun test_F025_aTapOfTheNudgeWhileOfflineWaitsAndTheRowSaysSo() {
        AttendanceFixtures.addAnna(sessions, anna)
        val phone = FakeConnectivity(false)
        launch(AttendanceFixtures.at("10:05"), phone, day = annaDay())
        compose.waitUntilTagExists(nudgeButton(AttendanceStatus.ATTENDED))

        compose.onNodeWithTag(nudgeButton(AttendanceStatus.ATTENDED)).performClick()

        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag(nudgeLine()).assertTextEquals(string(R.string.attendance_app_waiting))
            }.isSuccess
        }
        assertTrue("the buttons are gone while it waits", compose.noNode(nudgeButton(AttendanceStatus.ATTENDED)))
        assertTrue(server.sent.isEmpty())

        me.day = annaDay(open = false)
        phone.setOnline(true)
        compose.waitFor { server.sent.size == 1 }
        compose.waitFor { compose.noNode(nudgeLine()) }
    }

    @Test
    fun test_F025_aTapTheApiRefusedBringsTheButtonsBackWithItsMessage() {
        AttendanceFixtures.addAnna(sessions, anna)
        val phone = FakeConnectivity(false)
        launch(AttendanceFixtures.at("10:05"), phone, day = annaDay())
        compose.waitUntilTagExists(nudgeButton(AttendanceStatus.ATTENDED))
        compose.onNodeWithTag(nudgeButton(AttendanceStatus.ATTENDED)).performClick()
        compose.waitUntilTagExists(nudgeLine())

        // The session was cancelled meanwhile: the tap is refused with the server's message.
        server.sessions.getValue(AttendanceFixtures.annaSession).cancelled = true
        me.day = annaDay()
        phone.setOnline(true)

        compose.waitUntilTagExists(NudgeTags.message(prefix, session))
        compose.onNodeWithTag(
            NudgeTags.message(prefix, session),
        ).assertTextEquals(string(R.string.attendance_cancelled_session))
        compose.onNodeWithTag(nudgeButton(AttendanceStatus.ATTENDED)).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun test_F025_anEndedClassWithOpenParticipantsHasTheLineThatOpensCo05() {
        AttendanceFixtures.addKracht(sessions)
        launch(
            AttendanceFixtures.at("19:30"),
            day = AttendanceFixtures.day(AttendanceFixtures.krachtItem(open = true)),
        )
        val kracht = AttendanceFixtures.kracht
        compose.waitUntilTagExists(NudgeTags.line(prefix, kracht))

        compose.onNodeWithTag(NudgeTags.line(prefix, kracht)).assertTextEquals(string(R.string.attendance_nudge))
        assertTrue(
            "the line has no buttons",
            compose.onAllNodes(
                hasTestTag(NudgeTags.button(prefix, kracht, AttendanceStatus.ATTENDED)),
            ).fetchSemanticsNodes().isEmpty(),
        )
        compose.onNodeWithTag(
            TodayTags.todoChip(kracht),
        ).assertTextEquals(string(R.string.attendance_app_chip, "Kracht", "18:00"))

        compose.onNodeWithTag(NudgeTags.line(prefix, kracht)).performScrollTo().performClick()

        compose.waitUntilTagExists(AttendanceTags.TITLE)
        compose.waitForDescription(AttendanceTags.SUMMARY, summary(0, 0, 7))
    }

    // AC7: John, the Owner, takes attendance from the workspace's day (*Hele studio*), with the same nudge as on Vandaag.
    @Test
    fun test_F025_AC7_johnTakesAttendanceFromTheWorkspaceDay() {
        val marked = StudioFixtures.anna.copy(
            attendanceOpen = true,
            clients = listOf(PersonalSessionClient(anna.id, anna.name)),
        )
        val studioSession = marked.id
        server.add(
            FakeAttendance(
                studioSession,
                type = Attendance.Type.PRIVATE,
                opensAt = FakeAttendanceServer.at(AttendanceFixtures.at("17:30")),
                participants = mutableListOf(
                    AttendanceParticipant(anna.id, anna.name, AttendanceParticipant.Status.BOOKED),
                ),
            ),
        )
        val workspaces = FakeWorkspacesApi().apply {
            workspaceDay = StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, marked), busiest = null)
        }
        val trainers = FakeTrainersApi().apply { this.trainers = StudioFixtures.team }
        launch(
            AttendanceFixtures.at("19:30"),
            day = AttendanceFixtures.day(AttendanceFixtures.krachtItem()),
            workspaces = workspaces,
            trainers = trainers,
            teamMemberId = StudioFixtures.john.id,
        )
        compose.waitUntilTagExists(StudioTags.SCOPE)
        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).performClick()
        val line = NudgeTags.line(prefix, studioSession)
        compose.waitUntilTagExists(line)

        compose.onNodeWithTag(line).assertTextEquals(string(R.string.attendance_nudge))
        compose.onNodeWithTag(
            NudgeTags.button(prefix, studioSession, AttendanceStatus.ATTENDED),
        ).performScrollTo().performClick()

        compose.waitFor { server.sent.size == 1 }
        assertEquals(studioSession, server.sent.single().sessionId)
        assertEquals(SetAttendanceRequest.Status.ATTENDED, server.sent.single().status)
        assertEquals(anna.id, server.sent.single().clientId)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
