import { formattingLocales, locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { demoMetadata } from './demo-metadata';
import { homeMetadata } from './metadata';
import { ogHeadline } from './og-image';
import { builtPages, type SitePage, unlistedPages } from './routes';
import { ogImagePath, pageCopy, pageSeo, pageUrl, siteImagePages, siteOrigin } from './seo';

const everyPage: readonly SitePage[] = [...builtPages, ...unlistedPages];

describe('F064 AC12 the address of a page', () => {
  it('is on https://fivvi.app, in each language', () => {
    expect(siteOrigin).toBe('https://fivvi.app');
    expect(pageUrl('home', 'nl-NL')).toBe('https://fivvi.app/');
    expect(pageUrl('home', 'en')).toBe('https://fivvi.app/en');
    expect(pageUrl('gyms', 'nl-NL')).toBe('https://fivvi.app/sportscholen');
    expect(pageUrl('gyms', 'en')).toBe('https://fivvi.app/en/gyms');
  });
});

describe.each(locales)('F064 AC12 the search metadata of a page in %s', (locale) => {
  it('has a canonical URL of its own, and hreflang for nl, en and x-default', () => {
    for (const page of everyPage) {
      const { alternates } = pageSeo(page, locale, { title: 't', description: 'd' });

      expect(alternates?.canonical).toBe(pageUrl(page, locale));
      expect(alternates?.languages).toEqual({
        nl: pageUrl(page, 'nl-NL'),
        en: pageUrl(page, 'en'),
        'x-default': pageUrl(page, 'nl-NL'),
      });
    }
  });

  it('keeps the title and description it was given, and shares them with Open Graph', () => {
    const seo = pageSeo('pricing', locale, { title: 'A title', description: 'A description' });

    expect(seo.title).toBe('A title');
    expect(seo.description).toBe('A description');
    expect(seo.openGraph).toMatchObject({
      type: 'website',
      title: 'A title',
      description: 'A description',
      url: pageUrl('pricing', locale),
      siteName: 'Fivvi',
      locale: formattingLocales[locale].replace('-', '_'),
    });
  });

  it('has its own Open Graph image, 1200 x 630, with the title as its text', () => {
    const images = new Set<string>();
    for (const page of everyPage) {
      const seo = pageSeo(page, locale, { title: `Title of ${page}`, description: 'd' });

      expect(seo.openGraph?.images).toEqual([
        {
          url: `${siteOrigin}${ogImagePath(page, locale)}`,
          width: 1200,
          height: 630,
          alt: `Title of ${page}`,
        },
      ]);
      expect(seo.twitter).toMatchObject({ card: 'summary_large_image' });
      images.add(ogImagePath(page, locale));
    }
    expect(images.size).toBe(everyPage.length);
  });

  it('lists every page, built or not, as one that has an image', () => {
    expect(siteImagePages).toEqual(expect.arrayContaining([...everyPage]));
  });
});

describe('F064 AC12 a page that is not built yet is not found by a search engine', () => {
  it('sends noindex for a page that is in unlistedPages, and nothing for a built one', () => {
    for (const locale of locales) {
      expect(pageSeo('demo', locale, { title: 't', description: 'd' }).robots).toEqual({
        index: false,
        follow: false,
      });
      expect(demoMetadata(locale).robots).toEqual({ index: false, follow: false });
      expect(pageSeo('home', locale, { title: 't', description: 'd' }).robots).toBeUndefined();
      expect(homeMetadata(locale).robots).toBeUndefined();
    }
  });
});

describe('F064 AC12 every page’s title and description are its own', () => {
  it.each(locales)('in %s the catalog has a unique title and description per page', (locale) => {
    const copy = messages[locale].site;
    const pairs = [
      [copy.meta.homeTitle, copy.meta.homeDescription],
      ...(['gyms', 'studios', 'personalTrainers', 'clients'] as const).map(
        (key) => [copy.audience[key].metaTitle, copy.audience[key].metaDescription] as const,
      ),
      ...(['pricing', 'support', 'subProcessors', 'demo'] as const).map(
        (key) => [copy[key].metaTitle, copy[key].metaDescription] as const,
      ),
    ];

    expect(new Set(pairs.map(([title]) => title)).size).toBe(pairs.length);
    expect(new Set(pairs.map(([, description]) => description)).size).toBe(pairs.length);
  });
});

describe.each(locales)('F064 AC12 the copy of every page with a page file in %s', (locale) => {
  it('is in the catalog, so every page has a title, a description and an image text', () => {
    for (const page of siteImagePages) {
      const { title, description } = pageCopy(page, locale);

      expect(title).not.toBe('');
      expect(description).not.toBe('');
      expect(ogHeadline(page, locale)).not.toContain('|');
    }
  });

  it('refuses a page that has none', () => {
    expect(() => pageCopy('privacy', locale)).toThrow(/privacy/);
  });
});
