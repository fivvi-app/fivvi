package app.fivvi.pro.attendance

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.classes.ClassDateTags
import app.fivvi.pro.classes.classDateOf
import app.fivvi.pro.classes.groupClassOf
import app.fivvi.pro.personal.TodayTags
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.waitUntilTagExists
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F025 #1617: TD-03 (*Les op datum*) lists the participants of the class date with their status from the API, in nl-NL and en:
// "Kracht" on 22 September with seven of them.
@RunWith(Parameterized::class)
class ClassParticipantsFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, language: AppLanguage) :
    AttendanceFlowBase(language) {
    private fun openTd03() {
        compose.waitUntilTagExists(TodayTags.row(AttendanceFixtures.kracht))
        compose.onNodeWithTag(TodayTags.row(AttendanceFixtures.kracht)).performClick()
        compose.waitUntilTagExists(ClassDateTags.TAKE_ATTENDANCE)
    }

    private fun participantTag(name: String) = ClassDateTags.participant(id(name))

    private fun spoken(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().config
        .getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ").orEmpty()

    @Test
    fun test_F025_1617_td03ListsTheParticipantsWithTheirStatusAndShowAllListsTheRest() {
        AttendanceFixtures.addKracht(
            sessions,
            statuses = mapOf(
                "Anna" to AttendanceParticipant.Status.ATTENDED,
                "Bram" to AttendanceParticipant.Status.NO_SHOW,
            ),
        )
        launch(AttendanceFixtures.at("18:10"))
        openTd03()
        val names = AttendanceFixtures.names

        compose.waitUntilTagExists(ClassDateTags.PARTICIPANTS_TITLE)
        compose.onNodeWithTag(ClassDateTags.PARTICIPANTS_TITLE).assertTextEquals(
            string(R.string.attendance_participants_title, string(R.string.attendance_participants), "7"),
        )
        names.take(5).forEach { compose.onNodeWithTag(participantTag(it)).performScrollTo() }
        assertTrue("the first five", names.drop(5).all { compose.noNode(participantTag(it)) })
        assertEquals(
            string(
                R.string.attendance_app_row_label,
                "Anna de Vries",
                string(R.string.attendance_status_attended).lowercase(),
            ),
            spoken(participantTag("Anna de Vries")),
        )
        assertEquals(
            string(
                R.string.attendance_app_row_label,
                "Bram Jansen",
                string(R.string.attendance_status_no_show).lowercase(),
            ),
            spoken(participantTag("Bram Jansen")),
        )
        assertEquals(
            string(
                R.string.attendance_app_row_label,
                "Chris Bakker",
                string(R.string.attendance_status_booked).lowercase(),
            ),
            spoken(participantTag("Chris Bakker")),
        )

        compose.onNodeWithTag(ClassDateTags.SHOW_ALL).assertTextEquals(string(R.string.attendance_app_show_all, "7"))
        compose.onNodeWithTag(ClassDateTags.SHOW_ALL).performClick()

        compose.waitUntilTagExists(participantTag("Gijs Mol"))
        names.forEach { compose.onNodeWithTag(participantTag(it)).performScrollTo() }
        assertTrue("the button is gone once all are listed", compose.noNode(ClassDateTags.SHOW_ALL))
    }

    @Test
    fun test_F025_1617_aDateWithoutParticipantsSaysThereAreNoBookings() {
        sessions.sessions[AttendanceFixtures.kracht] = classDateOf(
            AttendanceFixtures.kracht,
            groupClassOf("Kracht", nameEn = "Strength"),
            trainer = trainerOf("Sarah"),
            start = LocalDateTime.of(2026, 9, 22, 18, 0),
            capacity = 8,
        )
        launch(AttendanceFixtures.at("18:10"))
        openTd03()

        compose.waitUntilTagExists(ClassDateTags.NO_BOOKINGS)
        compose.onNodeWithTag(ClassDateTags.NO_BOOKINGS).assertTextEquals(string(R.string.classes_date_no_bookings))
        assertTrue(compose.noNode(ClassDateTags.PARTICIPANTS_TITLE))
        assertTrue(compose.onAllNodes(hasTestTag(ClassDateTags.SHOW_ALL)).fetchSemanticsNodes().isEmpty())
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
