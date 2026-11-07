import { existsSync } from 'node:fs';
import path from 'node:path';
import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  alternatePath,
  builtPages,
  isBuilt,
  isSitePath,
  siteHomePath,
  sitePageAt,
  sitePagePath,
  sitePaths,
} from './routes';

const appDir = path.resolve(import.meta.dirname, '../app/(site)');

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
    for (const page of builtPages) {
      for (const locale of locales) {
        const group = locale === 'en' ? '(en)' : '(nl)';
        const route = sitePagePath(page, locale).replace(/^\//, '');
        if (!existsSync(path.join(appDir, group, route, 'page.tsx'))) {
          missing.push(`${page} in ${locale}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(isBuilt('home')).toBe(true);
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
