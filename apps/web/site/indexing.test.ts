import { describe, expect, it } from 'vitest';
import { noindexValue, robotsHeader, robotsTxt, sitemapEntries } from './indexing';
import {
  builtPages,
  type SitePage,
  siteIndexable,
  sitePagePath,
  sitePaths,
  unlistedPages,
} from './routes';
import { pageUrl } from './seo';

const production = { RAILWAY_ENVIRONMENT_NAME: 'production' };
const preview = { RAILWAY_ENVIRONMENT_NAME: 'pr-644' };
const development = { RAILWAY_ENVIRONMENT_NAME: 'development' };
const local = {};

describe('F064 since go-live (#648) the one switch is on, for production only', () => {
  it('siteIndexable is true', () => {
    expect(siteIndexable).toBe(true);
  });

  it('the defaults of the functions read the switch and the real environment', () => {
    // Production is indexable; every other environment is not, with the switch on.
    expect(robotsHeader('/', production)).toBeUndefined();
    expect(robotsHeader('/', preview)).toBe(noindexValue);
    expect(robotsTxt(production)).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://fivvi.app/sitemap.xml',
    });
    expect(robotsTxt(preview)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});

describe('F064 AC13 robots.txt', () => {
  it('in production once the site is indexable: allows the site and points to the sitemap', () => {
    expect(robotsTxt(production, true)).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://fivvi.app/sitemap.xml',
    });
  });

  it.each([
    ['production while the switch is off', production, false],
    ['a preview', preview, true],
    ['development', development, true],
    ['a local run', local, true],
    ['an environment with a blank name', { RAILWAY_ENVIRONMENT_NAME: ' ' }, true],
    ['a name that only contains production', { RAILWAY_ENVIRONMENT_NAME: 'production-2' }, true],
  ])('disallows everything and names no sitemap in %s', (_name, env, indexable) => {
    const robots = robotsTxt(env, indexable);

    expect(robots).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(robots.sitemap).toBeUndefined();
  });
});

describe('F064 AC13 the noindex header, decided per request', () => {
  const productionOpen = (pathname: string) => robotsHeader(pathname, production, true);

  it('production, switch on: the built pages, the sitemap, robots.txt and the images are open', () => {
    for (const page of builtPages) {
      for (const locale of ['nl-NL', 'en'] as const) {
        expect(productionOpen(sitePagePath(page, locale))).toBeUndefined();
      }
    }
    for (const path of [
      '/robots.txt',
      '/sitemap.xml',
      '/site-images/home.webp',
      '/site-og/nl/home',
      // The favicon files and the wordmark (#669): a search engine fetches the icon of the site.
      '/favicon.ico',
      '/icon.svg',
      '/icon.png',
      '/apple-icon.png',
      '/site-images/brand/fivvi-logo.svg',
    ]) {
      expect(productionOpen(path)).toBeUndefined();
    }
  });

  it('production, switch on: the app, sign-in, booking and join pages and the API still say noindex', () => {
    for (const path of [
      '/home',
      '/w/pilot-gym',
      '/w/pilot-gym/clients',
      '/login',
      '/login/confirm',
      '/welcome',
      '/book/pilot-gym',
      '/join/abc',
      '/api/v1/me',
      '/api/auth/get-session',
      '/no-such-page',
    ]) {
      expect(productionOpen(path)).toBe('noindex, nofollow');
    }
  });

  it('production, switch on: the demo page is a built page now, and is open in both languages', () => {
    expect(builtPages).toContain('demo');
    expect(productionOpen(sitePagePath('demo', 'nl-NL'))).toBeUndefined();
    expect(productionOpen(sitePagePath('demo', 'en'))).toBeUndefined();
  });

  it('production, switch on: a page that is not in the built list says noindex', () => {
    const withoutDemo = builtPages.filter((page) => page !== 'demo');

    for (const locale of ['nl-NL', 'en'] as const) {
      const path = sitePagePath('demo', locale);
      expect(robotsHeader(path, production, true, withoutDemo)).toBe(noindexValue);
    }
  });

  it('production, switch off: everything says noindex', () => {
    expect(robotsHeader('/', production, false)).toBe(noindexValue);
    expect(robotsHeader('/robots.txt', production, false)).toBe(noindexValue);
    expect(robotsHeader('/login', production, false)).toBe(noindexValue);
  });

  it.each([
    ['a preview', preview],
    ['development', development],
    ['a local run', local],
  ])('%s says noindex on everything, the switch on or off', (_name, env) => {
    for (const indexable of [true, false]) {
      for (const path of [
        '/',
        '/en/pricing',
        '/sitemap.xml',
        '/robots.txt',
        '/login',
        '/api/health',
      ]) {
        expect(robotsHeader(path, env, indexable)).toBe(noindexValue);
      }
    }
  });
});

describe('F064 AC13 sitemap.xml', () => {
  const entries = sitemapEntries();

  it('lists every built page in both languages, once each', () => {
    const urls = entries.map((entry) => entry.url);
    const expected = builtPages.flatMap((page) => [pageUrl(page, 'nl-NL'), pageUrl(page, 'en')]);

    expect([...urls].sort()).toEqual([...expected].sort());
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('gives each entry the alternates in nl, en and x-default', () => {
    for (const page of builtPages) {
      for (const locale of ['nl-NL', 'en'] as const) {
        const entry = entries.find((candidate) => candidate.url === pageUrl(page, locale));
        expect(entry?.alternates?.languages).toEqual({
          nl: pageUrl(page, 'nl-NL'),
          en: pageUrl(page, 'en'),
          'x-default': pageUrl(page, 'nl-NL'),
        });
      }
    }
  });

  it('lists the demo page in both languages, leaves out a page that is not built, and invents no date', () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(pageUrl('demo', 'nl-NL'));
    expect(urls).toContain(pageUrl('demo', 'en'));
    const withoutDemo = sitemapEntries(builtPages.filter((page) => page !== 'demo'));
    expect(withoutDemo.map((entry) => entry.url)).not.toContain(pageUrl('demo', 'nl-NL'));
    for (const page of unlistedPages) {
      expect(urls).not.toContain(pageUrl(page, 'nl-NL'));
      expect(urls).not.toContain(pageUrl(page, 'en'));
    }
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it('lists every page of the site: no address of sitePaths is missing', () => {
    const all = (Object.keys(sitePaths) as SitePage[]).flatMap((page) => [
      pageUrl(page, 'nl-NL'),
      pageUrl(page, 'en'),
    ]);

    expect(entries.map((entry) => entry.url).sort()).toEqual(all.sort());
  });

  it('follows the list it is given', () => {
    expect(sitemapEntries(['home']).map((entry) => entry.url)).toEqual([
      'https://fivvi.app/',
      'https://fivvi.app/en',
    ]);
  });
});
