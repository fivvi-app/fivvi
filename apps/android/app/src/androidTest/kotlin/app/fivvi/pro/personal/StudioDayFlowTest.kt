package app.fivvi.pro.personal

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.SessionTags
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.waitUntilTagExists
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"

// F014 AC11, the Owner's *Mijn dag | Hele studio* on Vandaag through the whole app with fake API clients, in nl-NL and en:
// Tuesday 22 September 2026 at 08:35 in John's Gym, where John (the Owner, who also trains) has Sarah and Tom on the team
// (synthetic). The studio's day is read-only.
@RunWith(Parameterized::class)
class StudioDayFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val workspaces = FakeWorkspacesApi()
    private val trainers = FakeTrainersApi()
    private val sessions = FakeSessionsApi()
    private val clients = FakeClientsApi()
    private val john = StudioFixtures.john
    private val mark = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.NL_NL)

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private val words get() = string(R.string.trainer_word_trainer_words)

    // The account as `GET /v1/me` answers it: John is the Owner (every capability), Sarah a Trainer (no calendar.manage).
    private fun launch(
        role: MeWorkspace.Role = MeWorkspace.Role.OWNER,
        account: app.fivvi.api.models.Trainer = john,
        team: List<app.fivvi.api.models.Trainer> = StudioFixtures.team,
        trainerWord: TrainerWord = TrainerWord.TRAINER,
    ) {
        val capabilities = MeWorkspace.Capabilities.values().toList().filter {
            role == MeWorkspace.Role.OWNER || it != MeWorkspace.Capabilities.CALENDAR_PERIOD_MANAGE
        }
        repeat(4) {
            me.answerAccount(
                email = "${account.name.substringBefore(' ').lowercase()}@example.com",
                name = account.name,
                workspaces = listOf(JOHNS_GYM),
                role = role,
                capabilities = capabilities,
                teamMemberId = account.id,
                trainerWords = mapOf(JOHNS_GYM to trainerWord),
            )
        }
        me.day = PersonalFixtures.sarah(
            items = listOf(PersonalFixtures.mark, PersonalFixtures.kracht),
            workspaceCount = 1,
            gap = null,
            places = emptyList(),
        )
        trainers.trainers = team
        workspaces.workspaceDay = StudioFixtures.johnsDay()
        clients.clients += mark
        sessions.clients[mark.id] = mark
        sessions.sessions[StudioFixtures.idOf("mark")] = sessionOf(
            id = StudioFixtures.idOf("mark"),
            client = mark,
            trainer = trainerOf("Sarah"),
            start = LocalDateTime.of(2026, 9, 22, 7, 0),
        )
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            workspacesApi = workspaces,
            trainersApi = trainers,
            sessionsApi = sessions,
            clientsApi = clients,
            startTab = ProTab.TODAY,
            now = PersonalFixtures.now,
        )
    }

    private fun waitForMijnDag() = compose.waitUntilTagExists(TodayTags.SUMMARY)

    private fun noNode(tag: String) = compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isEmpty()

    private fun descriptionOf(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().config
        .getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ").orEmpty()

    @Test
    fun test_F014_AC11_ownerTogglesWorkspaceDay() {
        launch()
        compose.waitUntilTagExists(StudioTags.SCOPE)

        compose.onNodeWithTag(StudioTags.SCOPE_MINE).assertIsSelected()
        compose.onNodeWithTag(StudioTags.SCOPE_MINE).assertTextEquals(string(R.string.my_day_app_scope_mine))
        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).assertTextEquals(string(R.string.my_day_app_scope_studio))
        compose.onNodeWithTag(TodayTags.row(PersonalFixtures.sessionIdOf("kracht"))).assertExists()
        assertTrue("the studio's day is read once it is chosen", workspaces.dayRequests.isEmpty())

        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).performClick()
        compose.waitUntilTagExists(StudioTags.HEAD)

        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).assertIsSelected()
        compose.onNodeWithTag(StudioTags.SCOPE_LINE)
            .assertTextEquals(string(R.string.my_day_app_studio_line, words, JOHNS_GYM))
        compose.onNodeWithTag(
            StudioTags.HEAD,
        ).assertTextEquals(string(R.string.my_day_app_studio_trainers_many, "3", words))
        compose.onNodeWithTag(StudioTags.BUSIEST)
            .assertTextEquals(string(R.string.my_day_app_studio_busiest, "2", "18:00", "19:00"))
        if (language == AppLanguage.DUTCH) {
            compose.onNodeWithTag(StudioTags.BUSIEST).assertTextEquals("Drukst 18:00–19:00 · 2 tegelijk")
        }
        // A lane for each of John (Jij), Sarah and Tom.
        compose.onNodeWithTag(StudioTags.lane(john.id.toString()))
            .assertTextEquals(string(R.string.my_day_app_studio_you))
        compose.onNodeWithTag(StudioTags.lane(StudioFixtures.sarah.id.toString())).assertTextEquals("Sarah")
        compose.onNodeWithTag(StudioTags.lane(StudioFixtures.tom.id.toString())).assertTextEquals("Tom")
        compose.onNodeWithTag(StudioTags.NOW).assertExists()
        // A block is named by its trainer, its title and its start, and is touched on at least 48 dp (size.touch-min).
        val kracht = compose.onNodeWithTag(StudioTags.block(StudioFixtures.idOf("kracht")))
        kracht.assertContentDescriptionEquals(
            string(R.string.my_day_app_studio_block, "10:00", "Kracht", "Sarah de Boer"),
        )
        kracht.assertHeightIsAtLeast(48.dp)
        // Rows, each with its trainer; the next card.
        assertTrue(descriptionOf(TodayTags.row(StudioFixtures.idOf("lisa"))).contains("Tom Bakker"))
        assertTrue(
            descriptionOf(TodayTags.row(StudioFixtures.idOf("anna"))).contains(string(R.string.my_day_app_studio_you)),
        )
        compose.onNodeWithTag(StudioTags.NEXT).assertExists()
        assertEquals(listOf(workspaceIdOf(JOHNS_GYM) to null), workspaces.dayRequests.toList())

        // A block opens TD-02 of its session, in the current workspace; back is the studio again.
        compose.onNodeWithTag(StudioTags.block(StudioFixtures.idOf("mark"))).performClick()
        compose.waitUntilTagExists(SessionTags.TITLE)
        assertEquals(listOf(workspaceIdOf(JOHNS_GYM) to StudioFixtures.idOf("mark")), sessions.readIn.toList())
        app.pressBack()
        compose.waitUntilTagExists(StudioTags.HEAD)

        compose.onNodeWithTag(StudioTags.SCOPE_MINE).performClick()
        compose.waitUntil(UI_TIMEOUT_MILLIS) { noNode(StudioTags.HEAD) }
        compose.onNodeWithTag(TodayTags.row(PersonalFixtures.sessionIdOf("kracht"))).assertExists()
    }

    // F068 AC1: John's Gym uses *instructeur*, so the studio's day talks about its *instructeurs* (*instructors*).
    @Test
    fun test_F068_AC1_theStudioDaySaysTheWorkspacesWord() {
        launch(trainerWord = TrainerWord.INSTRUCTEUR)
        compose.waitUntilTagExists(StudioTags.SCOPE)
        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).performClick()
        compose.waitUntilTagExists(StudioTags.HEAD)

        val plural = string(R.string.trainer_word_instructeur_words)
        compose.onNodeWithTag(StudioTags.SCOPE_LINE)
            .assertTextEquals(string(R.string.my_day_app_studio_line, plural, JOHNS_GYM))
        compose.onNodeWithTag(StudioTags.HEAD)
            .assertTextEquals(string(R.string.my_day_app_studio_trainers_many, "3", plural))
        assertEquals(if (language == AppLanguage.DUTCH) "instructeurs" else "instructors", plural)
    }

    // F067 AC8: John sees the level on the rows of Hele studio, named after the class; *Alle niveaus* shows none; no control.
    @Test
    fun test_F067_AC8_johnSeesTheLevelOnTheRowsOfHeleStudioAndHasNoControlToChangeIt() {
        launch()
        val reformer = StudioFixtures.session(
            "reformer",
            "14:00",
            "15:00",
            StudioFixtures.sarah,
            className = "Reformer Power",
            level = ClassLevel.ADVANCED,
        )
        val alle = StudioFixtures.session(
            "alle",
            "16:00",
            "17:00",
            StudioFixtures.tom,
            className = "Kracht",
            level = ClassLevel.ALL_LEVELS,
        )
        workspaces.workspaceDay =
            StudioFixtures.johnsDay(items = listOf(StudioFixtures.mark, StudioFixtures.kracht, reformer, alle))
        compose.waitUntilTagExists(StudioTags.SCOPE)
        compose.onNodeWithTag(StudioTags.SCOPE_STUDIO).performClick()
        compose.waitUntilTagExists(StudioTags.HEAD)

        val level = string(R.string.class_level_accessible_name, string(R.string.class_level_advanced))
        val rowTag = TodayTags.row(StudioFixtures.idOf("reformer"))
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(rowTag))
        assertTrue(descriptionOf(rowTag).contains(string(R.string.my_day_spoken_join, "Reformer Power", level)))
        compose.onNodeWithTag("today.level.${StudioFixtures.idOf("reformer")}", useUnmergedTree = true)
            .assertIsDisplayed().assertHasNoClickAction()
        val alleTag = TodayTags.row(StudioFixtures.idOf("alle"))
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(alleTag))
        assertFalse(descriptionOf(alleTag).contains(string(R.string.class_level_accessible_name, "").trim()))
        compose.onAllNodes(hasTestTag("today.level.${StudioFixtures.idOf("alle")}"), useUnmergedTree = true)
            .assertCountEquals(0)
    }

    @Test
    fun test_F014_AC11_aTrainerHasNoControl() {
        launch(role = MeWorkspace.Role.TRAINER, account = StudioFixtures.sarah)

        waitForMijnDag()
        compose.waitForIdle()

        assertTrue("Sarah, a Trainer of John's Gym, has no calendar.manage", noNode(StudioTags.SCOPE))
        assertTrue(noNode(StudioTags.SCOPE_LINE))
        assertTrue("the workspace's day is never asked for", workspaces.dayRequests.isEmpty())
    }

    @Test
    fun test_F014_AC11_aSoloOwnerHasNoControlAndNoStudioView() {
        launch(team = listOf(john))

        waitForMijnDag()
        compose.waitForIdle()

        assertTrue("no studio view without a team", noNode(StudioTags.SCOPE))
        assertTrue(noNode(StudioTags.SCOPE_LINE))
        compose.onNodeWithTag(TodayTags.SUMMARY).assertExists()
        assertTrue("the workspace's day is never asked for", workspaces.dayRequests.isEmpty())
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
