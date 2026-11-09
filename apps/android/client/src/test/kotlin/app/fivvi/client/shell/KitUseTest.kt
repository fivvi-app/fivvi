package app.fivvi.client.shell

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// E017 #504 (the design audit of 8 November 2026): the screens of Fivvi are made of the kit in `core/kit` (E020 AC14), the
// way Fivvi Pro's are, not of bare Material 3 buttons and text. How they look and behave is in `androidTest`.
class KitUseTest {
    private val shell = File("src/main/kotlin/app/fivvi/client/shell")
    private fun source(name: String) = File(shell, name).also { assertTrue("${it.path} exists", it.isFile) }.readText()

    @Test
    fun E017_noScreenOfFivviUsesABareMaterialButton() {
        val bare = Regex(
            """import androidx\.compose\.material3\.(Button|OutlinedButton|FilledTonalButton|TextButton|ElevatedButton)\b""",
        )
        val screens = shell.walkTopDown().filter { it.extension == "kt" }.toList()

        assertTrue("found no screens to read", screens.size >= 3)
        assertEquals(emptyList<String>(), screens.filter { bare.containsMatchIn(it.readText()) }.map { it.name })
    }

    @Test
    fun E017_profielSignsOutWithAPillButtonAndListsNameAndEmailInAGroupedList() {
        val profile = source("ProfileScreen.kt")

        assertTrue(profile.contains("import app.fivvi.core.kit.PillButton\n"))
        assertTrue(profile.contains("PillButton("))
        assertTrue(profile.contains("import app.fivvi.core.kit.InsetGroupedList\n"))
        assertTrue(profile.contains("InsetGroupedList"))
    }

    @Test
    fun E017_theNoWorkspaceScreenHoldsItsLinesInACard() {
        val noWorkspace = source("NoWorkspaceScreen.kt")

        assertTrue(noWorkspace.contains("import app.fivvi.core.kit.FivviCard\n"))
        assertTrue(noWorkspace.contains("FivviCard("))
    }
}
