package app.fivvi.core.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.fivvi.core.theme.tabular
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Radius
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.caption

/**
 * The status pill (AC14): a short label on the tint of its status or session type, like *Vol*, *Geannuleerd* or
 * 3/8. Colour is never the only signal, so it always has [text]. Digits are tabular, so counts line up; the words stay in the plain face.
 */
@Composable
fun StatusPill(text: String, tone: PillTone, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.tokens.pillColors(tone)
    Text(
        text = text,
        modifier = modifier
            .background(colors.container, RoundedCornerShape(Radius.sm))
            .padding(horizontal = Spacing.space2, vertical = Spacing.space1),
        color = colors.content,
        style = MaterialTheme.typography.caption.tabular(),
        maxLines = 1,
    )
}
