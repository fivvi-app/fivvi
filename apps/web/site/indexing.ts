import { isProductionEnvironment } from '@fivvi/email';
import { locales } from '@fivvi/i18n';
import type { MetadataRoute } from 'next';
import { builtPages, type SitePage, siteIndexable, sitePageAt } from './routes';
import { pageUrl, siteOrigin } from './seo';

type Env = Readonly<Record<string, string | undefined>>;

/** The value of the `X-Robots-Tag` header, and the same as the `robots` meta tag says. */
export const noindexValue = 'noindex, nofollow';

/** The files and generated images that stay findable once the site is: the crawler fetches them. */
const OPEN_FILES = ['/robots.txt', '/sitemap.xml'];
const OPEN_PREFIXES = ['/site-images/', '/site-og/'];

/**
 * Whether a search engine may index this environment at all: only `production`, and only once the
 * switch `siteIndexable` is on (#648). Read at run time: the same Docker image serves production,
 * development and every preview, so a build-time check would be wrong in all but one of them.
 * `env` is the whole environment object, never `process.env.X`, which the build would inline.
 */
function mayBeIndexed(env: Env, indexable: boolean): boolean {
  return indexable && isProductionEnvironment(env);
}

/**
 * The `X-Robots-Tag` value for a request path, or `undefined` when the page may be indexed (AC13).
 * Everything says `noindex` except, in production once the switch is on, the built pages of the
 * site and the files a crawler needs. The app, sign-in, booking and join pages, the API and the
 * pages nothing links to yet (the demo page) say `noindex` there too. The route guard (`proxy.ts`)
 * sends it, which keeps every site page static: the page's markup does not depend on the request.
 */
export function robotsHeader(
  pathname: string,
  env: Env = process.env,
  indexable: boolean = siteIndexable,
  built: readonly SitePage[] = builtPages,
): string | undefined {
  if (!mayBeIndexed(env, indexable)) return noindexValue;
  if (OPEN_FILES.includes(pathname)) return undefined;
  if (OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return undefined;
  const at = sitePageAt(pathname);
  return at && built.includes(at.page) ? undefined : noindexValue;
}

/**
 * `robots.txt` (AC13): the site is allowed and the sitemap is named only where a search engine may
 * index (`mayBeIndexed`). Everywhere else it disallows everything. The app's pages are not
 * disallowed here, on purpose: a crawler that may not fetch a page cannot see its `noindex`, and the
 * site links to the sign-in page, so the address could still be listed.
 */
export function robotsTxt(
  env: Env = process.env,
  indexable: boolean = siteIndexable,
): MetadataRoute.Robots {
  if (!mayBeIndexed(env, indexable)) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${siteOrigin}/sitemap.xml` };
}

/**
 * `sitemap.xml` (AC13): every built page in both languages, each with the alternates in `nl`, `en`
 * and `x-default`. No `lastmod`: a date the pages do not know would be made up. Pages that are not
 * built yet (`unlistedPages`) are left out.
 */
export function sitemapEntries(pages: readonly SitePage[] = builtPages): MetadataRoute.Sitemap {
  return pages.flatMap((page) =>
    locales.map((locale) => ({
      url: pageUrl(page, locale),
      alternates: {
        languages: {
          nl: pageUrl(page, 'nl-NL'),
          en: pageUrl(page, 'en'),
          'x-default': pageUrl(page, 'nl-NL'),
        },
      },
    })),
  );
}
