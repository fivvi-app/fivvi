package app.fivvi.client.links

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// E017 #506: Fivvi declares a verified intent filter for fivvi.app with `/j/*` and `/i/*` only; Fivvi Pro declares none
// for web links (verified links are the client app's, the web serves its association files for `app.fivvi` alone, AC5).
class LinkManifestTest {
    private val client = File("src/main/AndroidManifest.xml").readText()
    private val pro = File("../app/src/main/AndroidManifest.xml").readText()

    private val intentFilter = Regex("""<intent-filter[^>]*>.*?</intent-filter>""", RegexOption.DOT_MATCHES_ALL)

    private fun filters(manifest: String): List<String> = intentFilter.findAll(manifest).map { it.value }.toList()

    private val verified: List<String>
        get() = filters(client).filter { it.contains("autoVerify=\"true\"") }

    @Test
    fun E017_AC6_fivviHasOneVerifiedFilterForTheWebLinks() {
        val filter = verified.single()

        assertTrue(filter.contains("""<action android:name="android.intent.action.VIEW" />"""))
        assertTrue(filter.contains("""<category android:name="android.intent.category.DEFAULT" />"""))
        assertTrue(filter.contains("""<category android:name="android.intent.category.BROWSABLE" />"""))
        assertEquals(listOf("https"), values(filter, "scheme"))
        assertEquals(listOf("fivvi.app"), values(filter, "host"))
        assertEquals(listOf("/j/", "/i/"), values(filter, "pathPrefix"))
        // Nothing wider: no bare path, no pattern, no other path attribute.
        val others = Regex("""android:path(?!Prefix)\w*""").findAll(filter).map { it.value }.toList()
        assertEquals(emptyList<String>(), others)
    }

    // The system applies the filter before the router sees a link, so the two must accept the same paths.
    @Test
    fun E017_AC6_theFilterAndTheRouterAcceptTheSamePaths() {
        values(verified.single(), "pathPrefix").forEach {
            assertTrue(it, LinkRouter().open("https://fivvi.app${it}X1") != null)
        }
    }

    @Test
    fun E017_AC6_onlyTheLauncherAndTheVerifiedFilterExist() {
        assertEquals(2, filters(client).size)
    }

    @Test
    fun E017_AC6_fivviProDeclaresNoLinkFilter() {
        filters(pro).forEach {
            assertFalse(it, it.contains("android.intent.action.VIEW"))
            assertFalse(it, it.contains("android:scheme"))
            assertFalse(it, it.contains("autoVerify"))
        }
        assertFalse(pro.contains("android:host"))
    }

    private fun values(filter: String, attribute: String) =
        Regex("""android:$attribute="([^"]+)"""").findAll(filter).map { it.groupValues[1] }.toList()
}
