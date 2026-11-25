package app.fivvi.pro.classes

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.R
import app.fivvi.core.kit.classLevelFieldOrder
import app.fivvi.core.kit.classLevelWord
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.pro.sessions.FormRow

/**
 * *Niveau* of TD-05 (F067), after the trainer: *Geen* to start with, then *Alle niveaus*, *Beginner*, *Gemiddeld* and
 * *Gevorderd*, as the iOS picker has them. A tap offers the five; the value is sent as `level`, and *Geen* sends none.
 */
@Composable
internal fun LevelRow(level: ClassLevel?, onLevel: (ClassLevel?) -> Unit) {
    var menu by rememberSaveable { mutableStateOf(false) }
    Box {
        FormRow(
            label = stringResource(R.string.class_level_field),
            value = classLevelWord(level),
            tag = NewClassTags.LEVEL,
            valueTag = NewClassTags.LEVEL_VALUE,
            onClick = { menu = true },
            muted = level == null,
        )
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.testTagsAsIds()) {
            DropdownMenuItem(
                text = { Text(classLevelWord(null)) },
                onClick = {
                    menu = false
                    onLevel(null)
                },
                modifier = Modifier.testTag(NewClassTags.LEVEL_NONE),
            )
            classLevelFieldOrder.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(classLevelWord(choice)) },
                    onClick = {
                        menu = false
                        onLevel(choice)
                    },
                    modifier = Modifier.testTag("${NewClassTags.LEVEL}.${choice.value}"),
                )
            }
        }
    }
}
