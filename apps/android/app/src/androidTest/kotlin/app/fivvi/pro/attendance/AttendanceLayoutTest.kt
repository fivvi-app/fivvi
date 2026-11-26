package app.fivvi.pro.attendance

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.AttendanceSummary
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.theme.FivviTheme
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// CO-05 and TD-02's attendance controls at the largest font scale (200 %) on a small phone (320 dp), and what TalkBack reads of
// them (flow 06's platform notes), in nl-NL and en: the buttons sit under the name, are at least 48 dp high and stay on screen;
// the selected one is a selected radio button; the summary is one polite live region.
@RunWith(Parameterized::class)
class AttendanceLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val sessionId = UUID.nameUUIDFromBytes("session".toByteArray())
    private val names = listOf("Anna de Vries", "Bram Jansen", "Kees Smit")
    private val statuses = listOf(
        AttendanceParticipant.Status.ATTENDED,
        AttendanceParticipant.Status.BOOKED,
        AttendanceParticipant.Status.CANCELLED,
    )

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun attendance() = Attendance(
        sessionId,
        Attendance.Type.GROUP,
        Attendance.Status.SCHEDULED,
        OffsetDateTime.of(2026, 9, 22, 15, 30, 0, 0, ZoneOffset.UTC),
        true,
        names.mapIndexed { i, name -> AttendanceParticipant(participantIdOf(name), name, statuses[i]) },
        AttendanceSummary(1, 0, 1, 1),
    )

    @Composable
    private fun Screen() {
        val attendance = attendance()
        AttendanceScreen(
            AttendanceState(AttendanceLoad.Loaded, attendance),
            AttendanceView(attendance, QueueState(), Instant.parse("2026-09-22T16:10:00Z")),
            "John's Gym",
            AttendanceActions(onBack = {}, onRetry = {}, onToggle = { _, _ -> }, onEveryone = {}),
        )
    }

    // The screen in the language of the test, at the phone's own font scale.
    @Composable
    private fun InLanguage(content: @Composable () -> Unit) {
        DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
            FivviTheme { content() }
        }
    }

    private fun button(name: String, status: AttendanceStatus) =
        compose.onNodeWithTag(AttendanceTags.button(participantIdOf(name), status))

    @Test
    fun test_F025_CO05_atTheLargestFontScaleTheButtonsSitUnderTheNameAndStayOnScreen() {
        compose.showAtLargestFontScale(language, width = 320.dp, height = 1200.dp) { Screen() }
        compose.waitForIdle()

        val name = compose.onNode(hasText("Anna de Vries")).getUnclippedBoundsInRoot()
        val attended = button("Anna de Vries", AttendanceStatus.ATTENDED).getUnclippedBoundsInRoot()
        val noShow = button("Anna de Vries", AttendanceStatus.NO_SHOW).getUnclippedBoundsInRoot()
        assertTrue("the buttons start below the name: $name $attended", attended.top >= name.bottom)
        assertTrue("both buttons are on the screen: $noShow", noShow.right <= 320.dp && attended.left >= 0.dp)
        button("Anna de Vries", AttendanceStatus.ATTENDED).assertHeightIsAtLeast(48.dp)
        button("Anna de Vries", AttendanceStatus.NO_SHOW).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun test_F025_CO05_theSelectedButtonIsASelectedRadioButtonAndTheRowNamesTheParticipant() {
        compose.setContent { InLanguage { Screen() } }
        compose.waitForIdle()

        button("Anna de Vries", AttendanceStatus.ATTENDED).assertIsSelected()
        button("Anna de Vries", AttendanceStatus.NO_SHOW).assertIsNotSelected()
        button("Bram Jansen", AttendanceStatus.ATTENDED).assertIsNotSelected()
        assertEquals(
            Role.RadioButton,
            button(
                "Anna de Vries",
                AttendanceStatus.ATTENDED,
            ).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Role),
        )
        assertEquals(
            "the buttons of a row are named after the participant",
            listOf(string(R.string.attendance_group_label, "Anna de Vries")),
            compose.onNodeWithTag(AttendanceTags.row(participantIdOf("Anna de Vries")), useUnmergedTree = true)
                .let {
                    button("Anna de Vries", AttendanceStatus.ATTENDED).fetchSemanticsNode().parent?.config
                        ?.getOrNull(SemanticsProperties.ContentDescription)
                },
        )
        assertTrue(
            "a participant who cancelled has no buttons",
            compose.onAllNodes(
                androidx.compose.ui.test.hasTestTag(
                    AttendanceTags.button(participantIdOf("Kees Smit"), AttendanceStatus.ATTENDED),
                ),
            )
                .fetchSemanticsNodes().isEmpty(),
        )
    }

    @Test
    fun test_F025_CO05_theSummaryIsOneElementReadAsTheSummaryLineAndAnnouncedPolitely() {
        compose.setContent { InLanguage { Screen() } }
        compose.waitForIdle()

        val config = compose.onNodeWithTag(AttendanceTags.SUMMARY).fetchSemanticsNode().config
        assertEquals(
            listOf(string(R.string.attendance_summary, "1", "0", "1")),
            config.getOrNull(SemanticsProperties.ContentDescription),
        )
        assertEquals(LiveRegionMode.Polite, config.getOrNull(SemanticsProperties.LiveRegion))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
