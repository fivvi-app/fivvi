package app.fivvi.pro.personal

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MyDaySummary
import app.fivvi.api.models.PersonalSession
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.theme.FivviTheme
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.localizedString
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.waitUntilTagExists
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// The substitution labels of F024 AC4 on Vandaag and Agenda (Android), in nl-NL and en: on Tuesday 20 October 2026 Mike Bakker
// covers Kracht (18:00) for Sarah Visser (synthetic people). Mike's day says "Je valt in voor Sarah Visser"; Sarah's keeps
// the class, dimmed, with "Overgenomen door Mike Bakker": no dot and no count in Agenda. Each test starts by waiting for what
// it reads, never for a tap right after launch (the flake of #1643).
@RunWith(Parameterized::class)
class SubstitutionScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val october20 = at("08:35", "2026-10-20").toInstant()
    private val opened = mutableListOf<UUID>()
    private val me = FakeMeApi()

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private val coveringText get() = string(app.fivvi.core.R.string.my_day_covering_for, "Sarah Visser")
    private val takenOverText get() = string(app.fivvi.core.R.string.my_day_taken_over_by, "Mike Bakker")

    // Mark's session at 11:00 is the next one, so Kracht is a row of the list.
    private val mark = PersonalFixtures.session(
        "mark-20",
        PersonalFixtures.johns,
        "11:00",
        "12:00",
        client = "Mark Jansen",
        day = "2026-10-20",
    )

    private fun day(
        kracht: PersonalSession,
        counted: Int,
        items: List<PersonalSession> = listOf(mark, kracht),
    ): MyDay = PersonalFixtures.sarah(
        items = items,
        workspaceCount = 1,
    ).copy(
        date = "2026-10-20",
        summary = MyDaySummary(counted, 0, items.first().startsAt, items.last().endsAt),
        tomorrow = null,
    )

    private fun showToday(day: MyDay) {
        val state = TodayState(
            load = TodayLoad.Loaded,
            day = day,
            updatedAt = october20,
            now = october20,
        )
        compose.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
                FivviTheme {
                    Box(Modifier.size(360.dp, 2600.dp)) {
                        TodayScreen(
                            state,
                            TodayActions(
                                onRefresh = {},
                                onOpen = { opened += it.id },
                                onRoute = {},
                                onPlan = null,
                                onOpenTomorrow = {},
                                onDismissNotices = {},
                            ),
                            PersonalRows.TIME_ZONE,
                            october20,
                        )
                    }
                }
            }
        }
        compose.waitUntilTagExists(TodayTags.TITLE)
    }

    private lateinit var model: AgendaViewModel

    private fun showAgenda(kracht: PersonalSession, now: Instant = october20) {
        me.sessions = listOf(mark, kracht)
        model = AgendaViewModel(me, MemoryPersonalStore(), { now }, Dispatchers.Unconfined)
        compose.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
                FivviTheme {
                    Box(Modifier.size(360.dp, 2600.dp)) {
                        AgendaTab(model, onOpen = { opened += it.id }, onRoute = {}, menu = {})
                    }
                }
            }
        }
        compose.waitUntilTagExists(AgendaTags.TITLE)
        compose.waitUntilTagExists("${AgendaTags.ROWS}.row.${PersonalFixtures.sessionIdOf("mark-20")}")
    }

    private fun tag(tag: String) = compose.onNodeWithTag(tag, useUnmergedTree = true)

    private fun exists(tag: String) =
        compose.onAllNodes(hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    private fun texts(text: String) = compose.onAllNodes(hasText(text), useUnmergedTree = true)

    private fun SemanticsNodeInteraction.names(): String =
        fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()

    private fun todayRow(session: PersonalSession) = tag(TodayTags.row(session.sessionId))

    private fun agendaRow(session: PersonalSession) = tag("${AgendaTags.ROWS}.row.${session.sessionId}")

    @Test
    fun test_F024_AC4_todayShowsCoveringAndTakenOver() {
        showToday(day(PersonalFixtures.covering, counted = 2))
        compose.waitUntilTagExists(TodayTags.row(PersonalFixtures.covering.sessionId))
        val row = todayRow(PersonalFixtures.covering)
        row.assertIsDisplayed()
        texts(coveringText).assertCountAtLeastOne()
        assertTrue("one name for TalkBack: ${row.names()}", row.names().contains(coveringText))
        assertFalse(row.names().contains(takenOverText))
    }

    // What TalkBack reads for the card: the content descriptions inside the next card.
    private fun nextCardNames() = compose.onAllNodes(
        hasAnyAncestor(
            hasTestTag(TodayTags.NEXT),
        ).and(SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription)),
        useUnmergedTree = true,
    ).fetchSemanticsNodes().flatMap { it.config.getOrNull(SemanticsProperties.ContentDescription).orEmpty() }

    @Test
    fun test_F024_AC4_1649_theNextCardOfTheCoveringTrainerSaysJeValtInVoorAndTalkBackReadsIt() {
        // Kracht (18:00) is Mike's only item and so the next one: the card is where Vandaag shows it (#1649).
        showToday(day(PersonalFixtures.covering, counted = 1, items = listOf(PersonalFixtures.covering)))
        compose.waitUntilTagExists(TodayTags.NEXT)
        compose.waitUntil(UI_TIMEOUT_MILLIS) { texts(coveringText).fetchSemanticsNodes().isNotEmpty() }

        tag(TodayTags.NEXT).assertIsDisplayed()
        assertFalse(
            "the next item is not repeated as a row",
            exists(TodayTags.row(PersonalFixtures.covering.sessionId)),
        )
        texts(coveringText).assertCountAtLeastOne()
        compose.waitUntil(UI_TIMEOUT_MILLIS) { nextCardNames().any { it.contains(coveringText) } }
        assertTrue("part of the card's name: ${nextCardNames()}", nextCardNames().any { it.contains(coveringText) })
        assertFalse(nextCardNames().any { it.contains(takenOverText) })
        tag(TodayTags.NEXT_OPEN).assertIsDisplayed()
    }

    @Test
    fun test_F024_AC4_1649_theNextCardOfADateWithoutASubstitutionHasNoLine() {
        showToday(day(PersonalFixtures.kracht, counted = 1, items = listOf(PersonalFixtures.kracht)))
        compose.waitUntilTagExists(TodayTags.NEXT)

        tag(TodayTags.NEXT).assertIsDisplayed()
        assertTrue(texts(coveringText).fetchSemanticsNodes().isEmpty())
        assertFalse(nextCardNames().any { it.contains(coveringText) })
    }

    @Test
    fun test_F024_AC4_sarahsVandaagKeepsTheClassWithOvergenomenDoorMikeAndCountsOnlyHerOwn() {
        // The API leaves a date taken over out of the summary and Straks: the count is what it sent.
        showToday(day(PersonalFixtures.takenOver, counted = 1))
        compose.waitUntilTagExists(TodayTags.row(PersonalFixtures.takenOver.sessionId))

        val row = todayRow(PersonalFixtures.takenOver)
        row.assertIsDisplayed()
        texts(takenOverText).assertCountAtLeastOne()
        assertTrue("one name for TalkBack: ${row.names()}", row.names().contains(takenOverText))
        assertFalse(row.names().contains(coveringText))
        assertFalse("no action on it", exists("today.nudge.${PersonalFixtures.takenOver.sessionId}"))
        val summary = tag(TodayTags.SUMMARY).fetchSemanticsNode().config
            .getOrNull(SemanticsProperties.Text).orEmpty().joinToString()
        assertTrue("1 session counted: $summary", summary.startsWith("1 "))
    }

    @Test
    fun test_F024_AC4_agendaShowsTheSameLabelsAndTheDimmedDateHasNoDot() {
        showAgenda(PersonalFixtures.covering)
        compose.waitUntilTagExists("${AgendaTags.ROWS}.row.${PersonalFixtures.covering.sessionId}")
        texts(coveringText).assertCountAtLeastOne()
        assertTrue(agendaRow(PersonalFixtures.covering).names().contains(coveringText))
        val dots = AgendaTags.dots(LocalDate.parse("2026-10-20"), listOf(AgendaKind.Private, AgendaKind.Group))
        assertTrue("the class she covers is a dot", exists(dots))
    }

    @Test
    fun test_F024_AC4_agendaOfTheReplacedTrainerHasTheLabelButNoDotOrCountForThatDate() {
        showAgenda(PersonalFixtures.takenOver)
        compose.waitUntilTagExists("${AgendaTags.ROWS}.row.${PersonalFixtures.takenOver.sessionId}")

        texts(takenOverText).assertCountAtLeastOne()
        assertTrue(agendaRow(PersonalFixtures.takenOver).names().contains(takenOverText))
        assertFalse(
            "not counted as one of hers",
            exists(AgendaTags.dots(LocalDate.parse("2026-10-20"), listOf(AgendaKind.Private, AgendaKind.Group))),
        )
        assertTrue(
            "only Mark's session is a dot",
            exists(AgendaTags.dots(LocalDate.parse("2026-10-20"), listOf(AgendaKind.Private))),
        )
    }

    @Test
    fun test_F024_AC4_theDayTimelineShowsTheLabelInTheBlockOfTheDimmedDate() {
        showAgenda(PersonalFixtures.takenOver)
        tag(AgendaTags.MODE_DAY).performClick()
        compose.waitUntilTagExists(AgendaTags.TIMELINE)
        compose.waitUntilTagExists(AgendaTags.block(PersonalFixtures.takenOver.sessionId))

        val block = tag(AgendaTags.block(PersonalFixtures.takenOver.sessionId))
        block.assertExists()
        assertTrue(block.names().contains(takenOverText))
        texts("18:00 · $takenOverText").assertCountAtLeastOne()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertCountAtLeastOne() =
        assertTrue("at least one node", fetchSemanticsNodes().isNotEmpty())

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
