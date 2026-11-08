package app.fivvi.core.web

import app.fivvi.core.AppLanguage

/** The pages of the public website that the apps link to. */
enum class SitePage { Support, Privacy }

/**
 * The public website's addresses (F064, spec #611), the one place the apps know them: the base URL and the path of each
 * page in each language. The website owns the paths (`apps/web/site/routes.ts`); `SiteLinksTest` fails when they drift.
 * The privacy page is built by #643, so until then its address answers 404. Both apps link to the same pages, so this
 * lives in `core/`.
 */
object SiteLinks {
    const val BASE_URL = "https://fivvi.app"

    fun path(page: SitePage, language: AppLanguage): String = when (page) {
        SitePage.Support -> when (language) {
            AppLanguage.DUTCH -> "/support"
            AppLanguage.ENGLISH -> "/en/support"
        }

        SitePage.Privacy -> when (language) {
            AppLanguage.DUTCH -> "/privacy"
            AppLanguage.ENGLISH -> "/en/privacy"
        }
    }

    fun url(page: SitePage, language: AppLanguage): String = BASE_URL + path(page, language)
}
