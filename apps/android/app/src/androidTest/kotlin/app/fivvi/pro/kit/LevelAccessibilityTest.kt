package app.fivvi.pro.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.kit.LevelIcon
import app.fivvi.core.kit.LevelIconForm
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// F067 AC13 (spec #587), NL and EN, light and dark: the accessibility checks of Google's framework (touch target size,
// speakable text, text contrast and the rest) find nothing in the level icon, each level in each of its forms.
@RunWith(Parameterized::class)
class LevelAccessibilityTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun F067_AC13_theLevelIconInEachFormPassesTheAccessibilityChecks() {
        compose.showKit(mode, language) {
            Column {
                ClassLevel.entries.forEach { level ->
                    LevelIconForm.entries.forEach { form -> LevelIcon(level, form, Modifier) }
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
