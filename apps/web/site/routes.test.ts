import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  alternatePath,
  builtPages,
  isSitePath,
  siteHomePath,
  sitePageAt,
  sitePagePath,
  sitePaths,
  unlistedPages,
} from './routes';

const appDir = path.resolve(import.meta.dirname, '../app/(site)');

/** The addresses of the page files below `directory`: `/`, `/sportscholen`, `/en/gyms`. */
function pageRoutes(directory: string, route = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return pageRoutes(path.join(directory, entry.name), `${route}/${entry.name}`);
    return entry.name === 'page.tsx' ? [route || '/'] : [];
  });
}

describe('F064 the site’s addresses (#611)', () => {
  it('Dutch at / and English at /en, with the address of every page in both languages', () => {
    expect(sitePaths.home).toEqual({ 'nl-NL': '/', en: '/en' });
    expect(sitePaths.gyms).toEqual({ 'nl-NL': '/sportscholen', en: '/en/gyms' });
    expect(sitePaths.pricing).toEqual({ 'nl-NL': '/prijzen', en: '/en/pricing' });
    expect(sitePaths.subProcessors).toEqual({
      'nl-NL': '/subverwerkers',
      en: '/en/sub-processors',
    });
  });

  it('English pages all sit under /en and Dutch pages never do', () => {
    for (const paths of Object.values(sitePaths)) {
      expect(paths.en === '/en' || paths.en.startsWith('/en/')).toBe(true);
      expect(paths['nl-NL'].startsWith('/en')).toBe(false);
    }
  });

  it('no two pages share an address', () => {
    const all = Object.values(sitePaths).flatMap((paths) => Object.values(paths));
    expect(new Set(all).size).toBe(all.length);
  });

  it('has a page file for every built page, in each language (so no link is a 404)', () => {
    const missing: string[] = [];
    for (const page of [...builtPages, ...unlistedPages]) {
      for (const locale of locales) {
        const group = locale === 'en' ? '(en)' : '(nl)';
        const route = sitePagePath(page, locale).replace(/^\//, '');
        if (!existsSync(path.join(appDir, group, route, 'page.tsx'))) {
          missing.push(`${page} in ${locale}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(builtPages).toContain('home');
  });

  it('builds the four audience pages (#639), so the header, the footer and the home page link them', () => {
    expect(builtPages).toEqual(
      expect.arrayContaining(['gyms', 'studios', 'personalTrainers', 'clients']),
    );
    expect(sitePaths.studios).toEqual({ 'nl-NL': '/studios', en: '/en/studios' });
    expect(sitePaths.personalTrainers).toEqual({
      'nl-NL': '/personal-trainers',
      en: '/en/personal-trainers',
    });
    expect(sitePaths.clients).toEqual({ 'nl-NL': '/klanten', en: '/en/clients' });
  });

  it('keeps the demo page out of the links until go-live: it exists, and nothing links to it (#648)', () => {
    expect(unlistedPages).toContain('demo');
    expect(builtPages).not.toContain('demo');
    expect(unlistedPages.filter((page) => builtPages.includes(page))).toEqual([]);
  });

  it('lists every page that has a page file in builtPages, so a forgotten entry never loses its links', () => {
    const unlisted: string[] = [];
    for (const [group, locale] of [
      ['(nl)', 'nl-NL'],
      ['(en)', 'en'],
    ] as const) {
      for (const route of pageRoutes(path.join(appDir, group))) {
        const at = sitePageAt(route);
        if (at?.locale !== locale)
          unlisted.push(`${route}: not an address of the site in ${locale}`);
        else if (!builtPages.includes(at.page) && !unlistedPages.includes(at.page)) {
          unlisted.push(
            `${route}: add '${at.page}' to builtPages (or unlistedPages) in site/routes.ts`,
          );
        }
      }
    }
    expect(unlisted).toEqual([]);
  });

  it('knows a page by its address, in either language', () => {
    expect(sitePageAt('/')).toEqual({ page: 'home', locale: 'nl-NL' });
    expect(sitePageAt('/en')).toEqual({ page: 'home', locale: 'en' });
    expect(sitePageAt('/en/gyms')).toEqual({ page: 'gyms', locale: 'en' });
    expect(sitePageAt('/sportscholen')).toEqual({ page: 'gyms', locale: 'nl-NL' });
    expect(sitePageAt('/home')).toBeUndefined();
    expect(sitePageAt('/en/')).toBeUndefined();
  });

  it('isSitePath lists exactly the site’s addresses, whole paths only', () => {
    expect(isSitePath('/')).toBe(true);
    expect(isSitePath('/en')).toBe(true);
    expect(isSitePath('/prijzen')).toBe(true);
    expect(isSitePath('/en/pricing')).toBe(true);
    expect(isSitePath('/en/pricing/x')).toBe(false);
    expect(isSitePath('/english')).toBe(false);
    expect(isSitePath('/home')).toBe(false);
    expect(isSitePath('/login')).toBe(false);
  });

  it('AC16: the language switch goes to the same page in the other language', () => {
    expect(alternatePath('/', 'en')).toBe('/en');
    expect(alternatePath('/en', 'nl-NL')).toBe('/');
    expect(alternatePath('/sportscholen', 'en')).toBe('/en/gyms');
    expect(alternatePath('/en/sub-processors', 'nl-NL')).toBe('/subverwerkers');
    // Not a site page (or unknown): the home page of that language.
    expect(alternatePath(null, 'en')).toBe('/en');
    expect(alternatePath('/nergens', 'nl-NL')).toBe('/');
    expect(siteHomePath('en')).toBe('/en');
  });
});
