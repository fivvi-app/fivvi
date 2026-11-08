import type { Locale } from '@fivvi/i18n';
import type { Route } from 'next';

/**
 * The public website's addresses (F064, spec #611): Dutch at `/`, English under `/en`, the language
 * from the path and nothing else. Every page has its own address in each language, which is not a
 * translation of the other's (`/sportscholen`, `/en/gyms`).
 */
export const sitePaths = {
  home: { 'nl-NL': '/', en: '/en' },
  gyms: { 'nl-NL': '/sportscholen', en: '/en/gyms' },
  studios: { 'nl-NL': '/studios', en: '/en/studios' },
  personalTrainers: { 'nl-NL': '/personal-trainers', en: '/en/personal-trainers' },
  clients: { 'nl-NL': '/klanten', en: '/en/clients' },
  pricing: { 'nl-NL': '/prijzen', en: '/en/pricing' },
  demo: { 'nl-NL': '/demo', en: '/en/demo' },
  support: { 'nl-NL': '/support', en: '/en/support' },
  privacy: { 'nl-NL': '/privacy', en: '/en/privacy' },
  terms: { 'nl-NL': '/voorwaarden', en: '/en/terms' },
  subProcessors: { 'nl-NL': '/subverwerkers', en: '/en/sub-processors' },
} as const satisfies Record<string, Record<Locale, string>>;

export type SitePage = keyof typeof sitePaths;

/**
 * The pages that exist so far. The header and the footer link only to these, so no link is a 404
 * while the site is built ticket by ticket: a ticket that adds a page adds it here, with its page
 * files in `app/(site)/(nl)` and `app/(site)/(en)/en` (`routes.test.ts` checks both). Merging to
 * `main` deploys to production, so a link to a page that is not there is never published.
 */
export const builtPages: readonly SitePage[] = [
  'home',
  'gyms',
  'studios',
  'personalTrainers',
  'clients',
  'pricing',
  'support',
  'subProcessors',
];

/**
 * Pages that exist, with their page files, but that nothing links to yet: they are not in
 * `builtPages`, so the header, the footer and the calls to action leave them out. The demo page
 * takes a visitor's personal data and sends it to the email provider, which the privacy policy does
 * not cover yet (#642, #643), and its mailbox may not exist (#612). The go-live ticket (#648) moves
 * `demo` to `builtPages`, which puts *Plan een demo* in the header and the footer and shows the
 * call to action on the pricing and help pages.
 */
export const unlistedPages: readonly SitePage[] = ['demo'];

/**
 * **The one switch for search engines (F064, AC13).** While `false`, the site sends `noindex` and
 * `robots.txt` disallows everything, in every environment, production included: merging to `main`
 * deploys to production, and the site must not be found before every claim on it is checked. The
 * go-live ticket (#648) flips it to `true`, which lets the `production` environment (and only that
 * one, see `site/indexing.ts`) be indexed. Whether an environment is production is decided at
 * run time, not here, because one Docker image serves every environment.
 */
export const siteIndexable: boolean = false;

/** The address of a page in a language. */
export function sitePagePath(page: SitePage, locale: Locale): Route {
  // The site's addresses are known here, not to the typed routes of the app.
  return sitePaths[page][locale] as Route;
}

/** The address of the home page of a language. */
export function siteHomePath(locale: Locale): Route {
  return sitePaths.home[locale] as Route;
}

const pageByPath = new Map<string, { page: SitePage; locale: Locale }>(
  (Object.keys(sitePaths) as SitePage[]).flatMap((page) =>
    (Object.keys(sitePaths[page]) as Locale[]).map(
      (locale) => [sitePaths[page][locale], { page, locale }] as const,
    ),
  ),
);

/** The page and language at an address, or `undefined` when the address is not the site's. */
export function sitePageAt(pathname: string): { page: SitePage; locale: Locale } | undefined {
  return pageByPath.get(pathname);
}

/**
 * Whether the address is one of the site's pages, in either language. The route guard
 * (`server/route-guard.ts`) leaves these open to anyone. Whole paths only: `/en/pricing/x` is not
 * the site's.
 */
export function isSitePath(pathname: string): boolean {
  return pageByPath.has(pathname);
}

/**
 * The same page in `locale` (AC16: the language switch), or the home page of that language when
 * the address is not a known page of the site.
 */
export function alternatePath(pathname: string | null, locale: Locale): Route {
  const at = pathname === null ? undefined : sitePageAt(pathname);
  return at ? sitePagePath(at.page, locale) : siteHomePath(locale);
}
