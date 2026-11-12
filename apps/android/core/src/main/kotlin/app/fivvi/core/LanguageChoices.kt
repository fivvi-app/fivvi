package app.fivvi.core

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body

/** The name of a language, always in its own language whatever the interface language is. */
@get:StringRes
val AppLanguage.profileName: Int
    get() = when (this) {
        AppLanguage.DUTCH -> R.string.user_menu_language_nl
        AppLanguage.ENGLISH -> R.string.user_menu_language_en
    }

@get:StringRes
private val AppLanguage.signInName: Int
    get() = when (this) {
        AppLanguage.DUTCH -> R.string.sign_in_language_nl
        AppLanguage.ENGLISH -> R.string.sign_in_language_en
    }

/**
 * *Profiel → Taal* (TM-04): the two languages as an inset grouped list with a check mark at the chosen one. Test tags are
 * `[tag].<locale>` (`profile.language.nl-NL`, `profile.language.en`), shared with the iOS accessibility identifiers.
 */
@Composable
fun LanguageList(tag: String, selected: AppLanguage, onChoose: (AppLanguage) -> Unit) {
    InsetGroupedList {
        AppLanguage.entries.forEach { language ->
            row {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = Spacing.space12)
                        .selectable(
                            selected = language == selected,
                            role = Role.RadioButton,
                            onClick = { onChoose(language) },
                        )
                        .testTag("$tag.${language.tag}")
                        .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(language.profileName), style = MaterialTheme.typography.body)
                    if (language == selected) {
                        Icon(
                            painterResource(R.drawable.ic_check),
                            contentDescription = null,
                            modifier = Modifier.size(Spacing.space6),
                            tint = MaterialTheme.tokens.accentText,
                        )
                    }
                }
            }
        }
    }
}

/**
 * TM-01's switch, *Nederlands | English*: a single choice, so the Material 3 segmented button (an outlined pill with a
 * check on the chosen one, never the connected button group). Tags as [LanguageList]'s.
 */
@Composable
fun LanguageSwitch(tag: String, selected: AppLanguage, onChoose: (AppLanguage) -> Unit) {
    val options = AppLanguage.entries.map {
        SegmentedOption(it, stringResource(it.signInName), tag = "$tag.${it.tag}")
    }
    SegmentedChoice(options, selected, onChoose, Modifier.padding(top = Spacing.space2))
}
