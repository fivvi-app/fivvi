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
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.pro.AppRule
import app.fivvi.pro.attendance.AttendanceFixtures.JOHNS_GYM
import app.fivvi.pro.classes.ClassDateTags
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
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
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule

/**
 * What the attendance flow tests share (F025, spec #460): Sarah, a Trainer of John's Gym, on Tuesday 22 September 2026 with fake API
 * clients, in nl-NL and en. The fake API holds the rules of the real one (the window, a cancelled session, a request ID stored
 * once); the screens are what a trainer sees after a tap.
 */
abstract class AttendanceFlowBase(protected val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    protected val me = FakeMeApi()
    protected val signInApi = FakeSignInApi()
    protected val sessions = FakeSessionsApi()
    protected val clients = FakeClientsApi()
    protected val anna: Client = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    protected val queueFile = MemoryPersonalStore()
    protected val server get() = sessions.attendance

    protected fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    protected fun launch(
        now: Instant,
        connectivity: FakeConnectivity = FakeConnectivity(),
        day: app.fivvi.api.models.MyDay = AttendanceFixtures.day(AttendanceFixtures.krachtItem()),
        startOnHome: Boolean = false,
        workspaces: WorkspacesApi = FakeWorkspacesApi(),
        trainers: TrainersApi = FakeTrainersApi(),
        teamMemberId: UUID = trainerIdOf("Sarah"),
    ) {
        me.day = day
        clients.clients += anna
        run {
            repeat(8) {
                me.answerAccount(
                    id = AttendanceFixtures.account,
                    email = "trainer@example.com",
                    name = "Sarah",
                    workspaces = listOf(JOHNS_GYM),
                    role = MeWorkspace.Role.OWNER,
                    teamMemberId = teamMemberId,
                )
            }
        }
        server.now = now
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            sessionsApi = sessions,
            workspacesApi = workspaces,
            trainersApi = trainers,
            clientsApi = clients,
            signInApi = signInApi,
            startTab = if (startOnHome) ProTab.HOME else ProTab.TODAY,
            now = now,
            connectivity = connectivity,
            attendance = queueFile,
        )
    }

    protected fun annaDay(open: Boolean = true) =
        AttendanceFixtures.day(AttendanceFixtures.annaItem(open, annaId = anna.id))

    protected fun openAnna() {
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.annaSession))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.annaSession)).performClick()
        compose.waitUntilTagExists(SessionTags.TITLE)
    }

    protected fun id(name: String) = participantIdOf(name)

    protected fun summary(attended: Int, noShow: Int, open: Int) =
        string(R.string.attendance_summary, attended.toString(), noShow.toString(), open.toString())
}
