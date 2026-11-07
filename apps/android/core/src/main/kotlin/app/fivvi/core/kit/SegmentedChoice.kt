package app.fivvi.core.kit

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.label

/** One option of a [SegmentedChoice]: the value it stands for, the text it shows and the test tag of its button. */
data class SegmentedOption<T>(val value: T, val label: String, val tag: String? = null)

/** Above this font scale the segments give up most of their side padding, and keep their check. */
private const val TIGHT_FONT_SCALE = 1.5f
private val TightPadding = PaddingValues(horizontal = Spacing.space1)

object SegmentedChoiceRules {
    /** Material 3 says two to five segments. More than that is a list. */
    fun fits(optionCount: Int) = optionCount in 2..5
}

/**
 * A single choice as the Material 3 segmented button (DECISIONS.md section 2, AC10): an outlined pill split in equal
 * segments, with a check on the selected one. It is never the connected button group of Material 3 Expressive, which
 * the owner rejected twice. Two to five [options]; the selected one is read by a screen reader as a selected radio button.
 * The check stays at every font scale: it is the one sign of the selection that isn't colour, and the fill alone is
 * about 1.03:1 against the unselected segment in light mode. Above 150% font scale the side padding shrinks to make
 * room for it, so a long label stays whole on one line; one that still doesn't fit wraps and is never cut off.
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
    // At the largest font scales a long label (Nederlands) needs most of its segment on a small phone: the side padding
    // gives way to it, the check does not.
    val tight = LocalDensity.current.fontScale > TIGHT_FONT_SCALE
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            val isSelected = option.value == selected
            SegmentedButton(
                selected = isSelected,
                onClick = { onSelect(option.value) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                modifier = option.tag?.let { Modifier.testTag(it) } ?: Modifier,
                icon = { SegmentedButtonDefaults.Icon(isSelected) },
                contentPadding = if (tight) TightPadding else SegmentedButtonDefaults.ContentPadding,
                label = { Text(option.label, style = MaterialTheme.typography.label) },
            )
        }
    }
}
