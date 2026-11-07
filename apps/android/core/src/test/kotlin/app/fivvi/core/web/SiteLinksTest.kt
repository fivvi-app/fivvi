package app.fivvi.core.web

import app.fivvi.core.AppLanguage
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

// F064 AC17 (spec #611, ticket #647): Profiel links to the privacy policy and to help and contact on the public website,
// in the language of the app.
class SiteLinksTest {
    @Test
    fun AC17_helpAndContactOpensTheSupportPageInTheLanguageOfTheApp() {
        assertEquals("https://fivvi.app/support", SiteLinks.url(SitePage.Support, AppLanguage.DUTCH))
        assertEquals("https://fivvi.app/en/support", SiteLinks.url(SitePage.Support, AppLanguage.ENGLISH))
    }

    @Test
    fun AC17_thePrivacyPolicyOpensThePrivacyPageInTheLanguageOfTheApp() {
        assertEquals("https://fivvi.app/privacy", SiteLinks.url(SitePage.Privacy, AppLanguage.DUTCH))
        assertEquals("https://fivvi.app/en/privacy", SiteLinks.url(SitePage.Privacy, AppLanguage.ENGLISH))
    }

    // The website owns its addresses (`apps/web/site/routes.ts`); a path that changes there must change here.
    @Test
    fun AC17_thePathsAreTheOnesTheWebsiteServes() {
        val routes = File("../../web/site/routes.ts").readText()
        for ((key, page) in mapOf("support" to SitePage.Support, "privacy" to SitePage.Privacy)) {
            val entry = Regex("""\b$key: \{ 'nl-NL': '([^']+)', en: '([^']+)' \}""").find(routes)
                ?: error("`$key` is not in apps/web/site/routes.ts")
            assertEquals(entry.groupValues[1], SiteLinks.path(page, AppLanguage.DUTCH))
            assertEquals(entry.groupValues[2], SiteLinks.path(page, AppLanguage.ENGLISH))
        }
    }
}
