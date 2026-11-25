package app.fivvi.pro.personal

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.v2.createComposeRule
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.FivviCard
import app.fivvi.pro.kit.Mode
import app.fivvi.pro.kit.assertAccessible
import app.fivvi.pro.kit.showKit
import java.util.UUID
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F067 AC13 (spec #587), NL and EN, light and dark: the accessibility checks of Google's framework find nothing in a row with
// the level bars after the class name, next to one without, on the card of a list.
@RunWith(Parameterized::class)
class PersonalRowAccessibilityTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private val reformer = PersonalRow(
        id = UUID.nameUUIDFromBytes("reformer".toByteArray()),
        workspaceId = UUID.nameUUIDFromBytes("gym".toByteArray()),
        workspaceName = "John's Gym",
        isGroup = true,
        title = "Reformer Power",
        startText = "15:00",
        endText = "16:00",
        namesKind = true,
        showsWorkspace = false,
        location = null,
        routeUrl = null,
        pill = null,
        isCancelled = false,
        isPast = false,
        level = ClassLevel.ADVANCED,
    )

    @Test
    fun F067_AC13_aRowWithTheBarsAfterTheClassNamePassesTheAccessibilityChecks() {
        compose.showKit(mode, language) {
            FivviCard {
                Column {
                    PersonalRowItem(reformer, onOpen = {}, onRoute = {})
                    PersonalRowItem(reformer.copy(title = "Kracht", level = null), onOpen = {}, onRoute = {})
                }
            }
        }
        compose.assertAccessible(mode)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}
