package app.fivvi.pro

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
 * *Profiel → Taal* (TM-04): the two languages as a list with a check mark at the chosen one. Test tags are
 * `[tag].<locale>` (`profile.language.nl-NL`, `profile.language.en`), shared with the iOS accessibility identifiers.
 */
@Composable
fun LanguageList(tag: String, selected: AppLanguage, onChoose: (AppLanguage) -> Unit) {
    AppLanguage.entries.forEach { language ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = Spacing.space12)
                .selectable(selected = language == selected, role = Role.RadioButton, onClick = { onChoose(language) })
                .testTag("$tag.${language.tag}"),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(language.profileName), style = MaterialTheme.typography.body)
            if (language ==
                selected
            ) {
                Icon(painterResource(R.drawable.ic_check), contentDescription = null, Modifier.size(Spacing.space6))
            }
        }
    }
}

/** TM-01's switch, *Nederlands | English*: the chosen one is selected. Tags as [LanguageList]'s. */
@Composable
fun LanguageSwitch(tag: String, selected: AppLanguage, onChoose: (AppLanguage) -> Unit) {
    Row(
        modifier = Modifier.padding(top = Spacing.space2),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppLanguage.entries.forEach { language ->
            TextButton(
                onClick = { onChoose(language) },
                modifier = Modifier
                    .semantics {
                        role = Role.RadioButton
                        this.selected = language == selected
                    }
                    .testTag("$tag.${language.tag}"),
            ) {
                Text(
                    stringResource(language.signInName),
                    style = MaterialTheme.typography.body,
                    fontWeight = if (language == selected) FontWeight.Bold else FontWeight.Normal,
                    color = if (language == selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
}
