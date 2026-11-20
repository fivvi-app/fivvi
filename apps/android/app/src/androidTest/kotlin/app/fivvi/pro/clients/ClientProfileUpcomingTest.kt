package app.fivvi.pro.clients

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.SessionTrainer
import app.fivvi.api.models.UpcomingSession
import app.fivvi.api.models.UpcomingSessions
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.sessionIdOf
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.showAtLargestFontScale
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// *Komende sessies* on the client profile (F020 AC9), in both languages at the largest font scale: Anna's three coming
// sessions in order, and the empty text.
@RunWith(Parameterized::class)
class ClientProfileUpcomingTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")
    private val opened = mutableListOf<UUID>()

    // English dates are written as en-GB, whatever the device's ICU calls September ("Sep" or "Sept").
    private fun english(instant: OffsetDateTime) =
        SessionFormat(java.util.Locale.UK, ZoneId.of("Europe/Amsterdam")).day(instant)

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun upcoming(vararg sessions: UpcomingSession) =
        UpcomingSessions(anna.id, "Europe/Amsterdam", sessions.toList())

    private fun session(name: String, start: String, end: String, trainer: Boolean = true) = UpcomingSession(
        sessionIdOf(name),
        OffsetDateTime.parse(start),
        OffsetDateTime.parse(end),
        if (trainer) SessionTrainer(sarah.id, sarah.name) else null,
    )

    private fun show(upcoming: UpcomingSessions?) = compose.showAtLargestFontScale(language, height = 1_400.dp) {
        ClientProfileScreen(
            ClientProfileState.Loaded(anna),
            Locale.NL_NL,
            "John's Gym",
            null,
            ClientProfileActions(
                {},
                {},
                null,
                {},
                {},
                {},
                {},
                ClientFormActions({}, {}, {}, {}, {}, {}),
                onOpenSession = { opened += it },
            ),
            upcoming,
        )
    }

    // AC9: three coming sessions, in the order the API gives them, each with its date, time and trainer.
    @Test
    fun test_F020_AC9_clientProfileShowsUpcomingSessions() {
        show(
            upcoming(
                session("one", "2026-09-24T07:00:00.000Z", "2026-09-24T08:00:00.000Z"),
                session("two", "2026-09-26T08:30:00.000Z", "2026-09-26T09:30:00.000Z", trainer = false),
                session("three", "2026-10-01T07:00:00.000Z", "2026-10-01T08:00:00.000Z"),
            ),
        )

        compose.onNodeWithTag(ClientProfileTags.UPCOMING_TITLE)
            .assertTextEquals(string(R.string.clients_profile_upcoming_title))
        val first = if (language ==
            AppLanguage.DUTCH
        ) {
            "do 24 sep"
        } else {
            english(OffsetDateTime.parse("2026-09-24T07:00:00Z"))
        }
        compose.onNodeWithTag("${ClientProfileTags.UPCOMING}.${sessionIdOf("one")}")
            .assertTextEquals(string(R.string.clients_profile_upcoming_when, first, "09:00"), "Sarah")
        val second = if (language ==
            AppLanguage.DUTCH
        ) {
            "za 26 sep"
        } else {
            english(OffsetDateTime.parse("2026-09-26T08:30:00Z"))
        }
        compose.onNodeWithTag("${ClientProfileTags.UPCOMING}.${sessionIdOf("two")}")
            .assertTextEquals(string(R.string.clients_profile_upcoming_when, second, "10:30"))
        compose.onNodeWithTag(
            "${ClientProfileTags.UPCOMING}.${sessionIdOf("three")}",
        ).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag(ClientProfileTags.UPCOMING_EMPTY).assertDoesNotExist()
    }

    @Test
    fun test_F020_AC9_aRowOpensTheSessionScreen() {
        show(upcoming(session("one", "2026-09-24T07:00:00.000Z", "2026-09-24T08:00:00.000Z")))

        compose.onNodeWithTag("${ClientProfileTags.UPCOMING}.${sessionIdOf("one")}").performScrollTo().performClick()

        assertEquals(listOf(sessionIdOf("one")), opened)
    }

    @Test
    fun test_F020_AC9_aClientWithoutSessionsShowsTheEmptyText() {
        show(upcoming())

        compose.onNodeWithTag(ClientProfileTags.UPCOMING_TITLE).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag(ClientProfileTags.UPCOMING_EMPTY)
            .assertTextEquals(string(R.string.clients_profile_upcoming_empty))
    }

    @Test
    fun test_F020_AC9_beforeTheSessionsAreReadTheOverviewShowsNoSection() {
        show(null)

        compose.onNodeWithTag(ClientProfileTags.OVERVIEW).assertIsDisplayed()
        compose.onNodeWithTag(ClientProfileTags.UPCOMING_TITLE).assertDoesNotExist()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
