package app.fivvi.core.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.label

/** One option of a [SegmentedChoice]: the value it stands for, the text it shows and the test tag of its button. */
data class SegmentedOption<T>(val value: T, val label: String, val tag: String? = null)

/** Above this font scale the segments drop their side padding and tighten the gap to the check, and keep the check. */
private const val TIGHT_FONT_SCALE = 1.5f

/**
 * The radius of the pill's two ends: half of the 40 dp a segment is high at normal font scale, so a pill there. Material
 * rounds an end by half the segment's height, which grows with a wrapped label (at 200% it is 55 dp, a curve that
 * reaches over a third of a segment and cuts a label's corner); this stays 20 dp.
 */
private val PillEndRadius = 20.dp

// Above the tight font scale the label may reach the segment's edge, except at the two outer ends, where it keeps 4 dp
// clear of the curve. The check sits at the start of the selected segment, so the first segment, when selected, has the
// check there and its label starts after it: nothing to keep clear, and the 4 dp stay for the label ("Nederlands" on one
// line beside the check on a 328 dp row).
private fun tightPadding(index: Int, count: Int, selected: Boolean) = PaddingValues(
    start = if (index == 0 && !selected) Spacing.space1 else Spacing.space0,
    end = if (index == count - 1) Spacing.space1 else Spacing.space0,
)

object SegmentedChoiceRules {
    /** Material 3 says two to five segments. More than that is a list. */
    fun fits(optionCount: Int) = optionCount in 2..5
}

/** The outline of segment [index] of [count]: what the segmented choice draws and clips its content to. */
@Composable
fun segmentedChoiceShape(index: Int, count: Int): Shape =
    SegmentedButtonDefaults.itemShape(index, count, RoundedCornerShape(PillEndRadius))

/**
 * A single choice as the Material 3 segmented button (DECISIONS.md section 2, AC10): an outlined pill split in equal
 * segments, with a check on the selected one. It is never the connected button group of Material 3 Expressive, which
 * the owner rejected twice. Two to five [options]; the selected one is read by a screen reader as a selected radio button.
 *
 * The check stays at every font scale: it is the one sign of the selection that isn't colour, and the fill alone is
 * about 1.03:1 against the unselected segment in light mode. Above 150% font scale the side padding goes and the gap
 * to the check halves, to make room for it ("Nederlands" is about 136 dp wide at 200%); only the outer side of the first
 * (unless it is the selected one, whose check is there) and the last segment keeps 4 dp, and the ends of the pill have a radius of 20 dp ([PillEndRadius]) at every scale, so a
 * wrapped label (a taller segment) stays clear of the curve. The check and the label are drawn together in the label
 * slot, so the label gets the width that is left after the check: a label that is too long for that wraps (inside its
 * segment, never past its edge or its curve), where Material's own check slot, added after the label is measured, would
 * push it out of the segment and cut it off.
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
    // The row is as high as its tallest segment, and every segment fills that height: a label that wraps doesn't leave
    // its neighbour a shorter segment.
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        options.forEachIndexed { index, option ->
            val isSelected = option.value == selected
            val padding =
                if (tight) tightPadding(index, options.size, isSelected) else SegmentedButtonDefaults.ContentPadding
            SegmentedButton(
                selected = isSelected,
                onClick = { onSelect(option.value) },
                shape = segmentedChoiceShape(index, options.size),
                modifier = Modifier.fillMaxHeight().let { base -> option.tag?.let { base.testTag(it) } ?: base },
                // Material's slot for the check is left empty: see above.
                icon = {},
                contentPadding = padding,
                label = {
                    SegmentLabel(option.label, isSelected, gap = if (tight) Spacing.space1 else Spacing.space2)
                },
            )
        }
    }
}

// The check, when selected, then the label in the width that is left. Decorative: the segment is the selected radio
// button for a screen reader, and the label names it.
@Composable
private fun SegmentLabel(text: String, selected: Boolean, gap: Dp) {
    Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        if (selected) {
            Icon(
                painter = painterResource(R.drawable.ic_check),
                contentDescription = null,
                modifier = Modifier.size(SegmentedButtonDefaults.IconSize),
            )
            Spacer(Modifier.size(gap))
        }
        Text(
            text,
            modifier = Modifier.weight(1f, fill = false),
            // Where the phone can (API 33 and up), a word that has to break is hyphenated.
            style = MaterialTheme.typography.label.copy(hyphens = Hyphens.Auto),
            textAlign = TextAlign.Center,
        )
    }
}
