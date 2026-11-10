import Foundation
import FivviAPI

/// The pages of the public website that the app links to.
enum SitePage: CaseIterable {
    case support, privacy
}

/// The public website's addresses (F064, spec #611), the one place the app knows them: the base URL and the path of each
/// page in each language. The website owns the paths (`apps/web/site/routes.ts`); `SiteLinksTests` fails when they
/// drift. Both pages are live on the website (the privacy policy by #643). Android keeps the same addresses in
/// `SiteLinks.kt` of its `core/`; the client app Fivvi (#503) takes this file into a shared package when it needs it.
enum SiteLinks {
    static let baseURL = "https://fivvi.app"

    static func path(_ page: SitePage, _ locale: Components.Schemas.Locale) -> String {
        switch (page, locale) {
        case (.support, .nlNL): "/support"
        case (.support, .en): "/en/support"
        case (.privacy, .nlNL): "/privacy"
        case (.privacy, .en): "/en/privacy"
        }
    }

    static func url(_ page: SitePage, _ locale: Components.Schemas.Locale) -> URL {
        guard let url = URL(string: baseURL + path(page, locale)) else {
            preconditionFailure("\(baseURL + path(page, locale)) is not a URL")
        }
        return url
    }
}
