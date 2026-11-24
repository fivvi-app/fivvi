package app.fivvi.pro.classes

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.CreateBookingLinkRequest
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import java.time.Instant
import java.time.LocalDateTime
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// TD-03 *Boekingslink delen* (F037 AC8, AC9 and the design of DECISIONS.md, Les (TD-03)) through the flow's own capability
// check and the fake API, in nl-NL and en at the largest font scale: John (Owner) and Sarah (Trainer) share Kracht on
// Tuesday 17 November 2026, 18:00; the clock says Monday 16 November 2026, 08:20 (Amsterdam). The clipboard is the one the
// flow was given, which a test of the phone's own clipboard backs up below.
@RunWith(Parameterized::class)
class ClassDateShareLinkFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val gym = workspaceIdOf("John's Gym")
    private val sarah = trainerOf("Sarah")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val links = FakeBookingLinksApi()
    private val connectivity = FakeConnectivity()
    private val clipboard = mutableListOf<String>()
    private val kracht = groupClassOf("Kracht", nameEn = "Strength", trainer = sarah)

    private fun string(id: Int) = localizedString(language, id)

    private val owner = MeWorkspace.Capabilities.values().toList()
    private val trainer = listOf(
        MeWorkspace.Capabilities.CLASS_PERIOD_READ,
        MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW,
        MeWorkspace.Capabilities.BOOKING_LINK_PERIOD_COPY,
    )

    private fun show(
        capabilities: List<MeWorkspace.Capabilities>,
        role: MeWorkspace.Role,
        start: LocalDateTime = LocalDateTime.of(2026, 11, 17, 18, 0),
        now: Instant = Instant.parse("2026-11-16T07:20:00Z"),
    ) {
        classes.classes[kracht.id] = kracht
        val date = classDateOf(UUID.randomUUID(), kracht, sarah, start = start)
        sessions.sessions[date.id] = date
        val apis = ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi(), links)
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            // The account read that follows a refusal fails, so what a 403 took away stays away.
            val listed = viewModel(key = "capabilities") {
                WorkspaceCapabilities(FakeMeApi().apply { answers += { throw IOException("offline") } })
            }
            listed.replace(
                listOf(MeWorkspace(gym, "John's Gym", "slug", TrainerWord.TRAINER, role, sarah.id, capabilities)),
            )
            ClassDateFlow(
                apis,
                listed,
                gym,
                "John's Gym",
                date.id,
                sarah.id,
                added = null,
                sessionKey = "token-1",
                opening = 1,
                onBack = {},
                connectivity = connectivity,
                onCancelled = {},
                now = { now },
                copy = { clipboard += it },
            )
        }
        compose.waitUntilTagExists(ClassDateTags.TITLE)
    }

    private fun waitForToast() = compose.waitUntil(UI_TIMEOUT_MILLIS) {
        compose.onAllNodesWithText(string(R.string.classes_app_share_link_copied)).fetchSemanticsNodes().isNotEmpty()
    }

    // AC8: John taps *Boekingslink delen*: the date's link is on the clipboard and "Boekingslink gekopieerd" shows.
    @Test
    fun test_F037_AC8_theOwnerTapsBoekingslinkDelenAndSeesItCopiedAndASecondTapGivesTheSameLink() {
        show(owner, MeWorkspace.Role.OWNER)
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertIsDisplayed()
            .assertTextEquals(string(R.string.classes_app_share_link))
        compose.onAllNodesWithText(string(R.string.classes_app_share_link_copied)).assertCountEquals(0)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).performClick()
        waitForToast()

        val sent = links.requests.single().second
        assertEquals(CreateBookingLinkRequest.Scope.SESSION, sent.scope)
        assertEquals(CreateBookingLinkRequest.Language.VISITOR, sent.language)
        assertEquals(CreateBookingLinkRequest.Surface.ANDROID, sent.surface)
        val link = links.links.values.single()
        assertEquals(listOf(link.url.toString()), clipboard)
        assertTrue(link.url.toString().startsWith("https://fivvi.app/l/"))
        // TalkBack announces the toast: it sits in a polite live region.
        compose.onNode(
            SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite) and
                hasAnyDescendant(hasText(string(R.string.classes_app_share_link_copied))),
        ).assertExists()

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).performClick()
        compose.waitUntil(UI_TIMEOUT_MILLIS) { clipboard.size == 2 }

        assertEquals("get-or-create: one link for the date", 1, links.links.size)
        assertEquals("the same link", 1, clipboard.toSet().size)
    }

    @Test
    fun test_F037_AC8_theOwnersMenuStartsWithBoekingslinkDelen() {
        show(owner, MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.SHARE_LINK_MENU)
        // (The menu is a popup window, which does not take the test's language override: its text is read through the app,
        // in ClassFlowTest.)
        val share = compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).getUnclippedBoundsInRoot()
        val edit = compose.onNodeWithTag(ClassDateTags.EDIT).getUnclippedBoundsInRoot()
        assertTrue("the first item, above Les wijzigen", share.top < edit.top)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).performClick()
        waitForToast()

        assertEquals(1, links.requests.size)
        assertEquals(1, clipboard.size)
    }

    // AC9: Sarah gets the same link as John; her capabilities give her no ⋯ menu.
    @Test
    fun test_F037_AC9_aTrainerGetsTheSameLinkAndHasNoMenu() {
        val start = LocalDateTime.of(2026, 11, 17, 18, 0)
        show(trainer, MeWorkspace.Role.TRAINER, start)
        val date = sessions.sessions.keys.single()
        val request = CreateBookingLinkRequest(
            CreateBookingLinkRequest.Scope.SESSION,
            CreateBookingLinkRequest.Language.VISITOR,
            sessionId = date,
        )
        // John made the link earlier.
        val johns = runBlocking { links.createBookingLink(gym, request) }.body()!!
        links.requests.clear()
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertIsDisplayed()

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).performClick()
        waitForToast()

        assertEquals("the same link as John's", listOf(johns.url.toString()), clipboard)
        assertEquals(1, links.links.size)
    }

    @Test
    fun test_F037_unavailable_aCancelledDateHasNoBoekingslinkDelen() {
        show(owner, MeWorkspace.Role.OWNER)
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertIsDisplayed()

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL_SUBMIT)
        compose.onNodeWithTag(ClassDateTags.CANCEL_SUBMIT).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCELLED)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        assertTrue("no link was asked for", links.requests.isEmpty())
    }

    @Test
    fun test_F037_unavailable_aPastClassDateHasNoBoekingslinkDelen() {
        // The clock says Wednesday 18 November: the date of Tuesday 17 November, 18:00, has started.
        show(owner, MeWorkspace.Role.OWNER, now = Instant.parse("2026-11-18T07:20:00Z"))

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.EDIT)
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).assertDoesNotExist()
        assertTrue(links.requests.isEmpty())
    }

    @Test
    fun test_F037_design_withoutBookingLinkCopyThereIsNoBoekingslinkDelen() {
        show(owner - MeWorkspace.Capabilities.BOOKING_LINK_PERIOD_COPY, MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.EDIT)
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).assertDoesNotExist()
    }

    @Test
    fun test_F037_unavailable_offlineBoekingslinkDelenIsOffAndSaysSo() {
        connectivity.setOnline(false)
        show(owner, MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(
            ClassDateTags.SHARE_OFFLINE,
        ).assertTextEquals(string(R.string.classes_app_share_link_offline))
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertIsNotEnabled()
        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.SHARE_LINK_MENU)
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).assertIsNotEnabled()
        assertTrue("nothing is queued", links.requests.isEmpty())

        connectivity.setOnline(true)
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            compose.onAllNodes(hasTestTag(ClassDateTags.SHARE_OFFLINE)).fetchSemanticsNodes().isEmpty()
        }
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK_MENU).assertIsEnabled()
    }

    @Test
    fun test_F037_design_aFailureSaysSomethingWentWrongInline() {
        links.status = 500
        show(owner, MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).performClick()
        compose.waitUntilTagExists(ClassDateTags.SHARE_FAILED)

        compose.onNodeWithTag(
            ClassDateTags.SHARE_FAILED,
        ).assertTextEquals(string(R.string.booking_links_errors_generic))
        assertTrue(clipboard.isEmpty())
    }

    @Test
    fun test_F037_design_aRefusalTakesBoekingslinkDelenAway() {
        links.status = 403
        show(owner, MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).performClick()
        compose.waitUntilTagExists(ClassDateTags.SHARE_FAILED)

        compose.onNodeWithTag(ClassDateTags.SHARE_FAILED)
            .assertTextEquals(string(R.string.booking_links_errors_no_permission))
        compose.onNodeWithTag(ClassDateTags.SHARE_LINK).assertDoesNotExist()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}
