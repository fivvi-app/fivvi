package app.fivvi.pro.classes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.CardRadius
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body

private val IconSize = 24.dp

/**
 * The banner of a substituted date for the one who covers it (F024, TD-03): *Je valt in voor Sarah* on the accent as a tint
 * (`color.accent.tint`), with the ⇄ icon in the accent as text and the words in the primary text colour, the pairs the
 * tokens declare. The prototype's banner of the same name.
 */
@Composable
internal fun SubstitutionBanner(text: String, modifier: Modifier = Modifier) {
    val tokens = MaterialTheme.tokens
    Row(
        modifier.fillMaxWidth()
            .background(tokens.accentTint, RoundedCornerShape(CardRadius))
            .padding(Spacing.space4)
            .testTag(ClassDateTags.SUBSTITUTION)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painterResource(R.drawable.ic_swap),
            contentDescription = null,
            modifier = Modifier.size(IconSize),
            tint = tokens.accentText,
        )
        Text(text, color = tokens.textPrimary, style = MaterialTheme.typography.body)
    }
}
