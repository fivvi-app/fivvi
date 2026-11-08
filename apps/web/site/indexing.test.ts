import { describe, expect, it } from 'vitest';
import { noindexValue, robotsHeader, robotsTxt, sitemapEntries } from './indexing';
import { builtPages, siteIndexable, sitePagePath, unlistedPages } from './routes';
import { pageUrl } from './seo';

const production = { RAILWAY_ENVIRONMENT_NAME: 'production' };
const preview = { RAILWAY_ENVIRONMENT_NAME: 'pr-644' };
const development = { RAILWAY_ENVIRONMENT_NAME: 'development' };
const local = {};

describe('F064 until go-live (#648) the one switch is off', () => {
  it('siteIndexable is false', () => {
    expect(siteIndexable).toBe(false);
  });

  it('the defaults of the functions read the switch and the real environment', () => {
    // Nothing indexable, whatever the environment says, while the switch is off.
    expect(robotsHeader('/', production)).toBe(noindexValue);
    expect(robotsTxt(production)).toMatchObject({ rules: { disallow: '/' } });
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

  it('production, switch on: a page nothing links to yet (the demo page) says noindex', () => {
    for (const page of unlistedPages) {
      for (const locale of ['nl-NL', 'en'] as const) {
        expect(productionOpen(sitePagePath(page, locale))).toBe(noindexValue);
      }
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

  it('leaves out the pages that are not built yet, and invents no date', () => {
    for (const page of unlistedPages) {
      expect(entries.map((entry) => entry.url)).not.toContain(pageUrl(page, 'nl-NL'));
      expect(entries.map((entry) => entry.url)).not.toContain(pageUrl(page, 'en'));
    }
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it('follows the list it is given', () => {
    expect(sitemapEntries(['home']).map((entry) => entry.url)).toEqual([
      'https://fivvi.app/',
      'https://fivvi.app/en',
    ]);
  });
});
