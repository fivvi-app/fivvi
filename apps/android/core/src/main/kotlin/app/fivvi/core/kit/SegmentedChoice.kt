package app.fivvi.core.kit

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.fivvi.designtokens.label

/** One option of a [SegmentedChoice]: the value it stands for, the text it shows and the test tag of its button. */
data class SegmentedOption<T>(val value: T, val label: String, val tag: String? = null)

object SegmentedChoiceRules {
    /** Material 3 says two to five segments. More than that is a list. */
    fun fits(optionCount: Int) = optionCount in 2..5
}

/**
 * A single choice as the Material 3 segmented button (DECISIONS.md section 2, AC10): an outlined pill split in equal
 * segments, with a check on the selected one. It is never the connected button group of Material 3 Expressive, which
 * the owner rejected twice. Two to five [options]; the selected one is read by a screen reader as a selected radio button.
 */
@Composable
fun <T> SegmentedChoice(
    options: List<SegmentedOption<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    require(SegmentedChoiceRules.fits(options.size)) {
        "A segmented button has two to five options, not ${options.size}"
    }
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            val isSelected = option.value == selected
            SegmentedButton(
                selected = isSelected,
                onClick = { onSelect(option.value) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                modifier = option.tag?.let { Modifier.testTag(it) } ?: Modifier,
                icon = { SegmentedButtonDefaults.Icon(isSelected) },
                label = { Text(option.label, style = MaterialTheme.typography.label, maxLines = 1) },
            )
        }
    }
}
