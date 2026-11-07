import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { audiencePageIds } from './audience/audience-data';
import { audienceMetadata } from './audience/audience-metadata';
import { homeMetadata, siteRootMetadata } from './metadata';

describe('F064 until the go-live ticket (#648) every site page sends noindex', () => {
  it('the root layout of the site says noindex, nofollow', () => {
    expect(siteRootMetadata.robots).toEqual({ index: false, follow: false });
  });

  it('a page’s own metadata never turns indexing back on', () => {
    for (const locale of locales) {
      expect(homeMetadata(locale).robots).toBeUndefined();
    }
  });
});

describe.each(locales)('F064 the home page’s metadata in %s', (locale) => {
  it('has the catalog’s title and description, and they are not the other language’s', () => {
    const { title, description } = homeMetadata(locale);
    const copy = messages[locale].site.meta;

    expect(title).toBe(copy.homeTitle);
    expect(description).toBe(copy.homeDescription);
    expect(title).not.toBe(messages[locale === 'en' ? 'nl-NL' : 'en'].site.meta.homeTitle);
  });
});

describe.each(locales)('F064 the audience pages’ metadata in %s', (locale) => {
  it('gives each page its own title and a description from its lead, and never turns indexing on', () => {
    const titles = new Set<string>();
    for (const page of audiencePageIds) {
      const { title, description, robots } = audienceMetadata(page, locale);
      const copy = messages[locale].site.audience[page];

      expect(title).toBe(copy.metaTitle);
      expect(description).toBe(copy.lead);
      expect(robots).toBeUndefined();
      titles.add(String(title));
    }
    expect(titles.size).toBe(audiencePageIds.length);
    expect(titles).not.toContain(messages[locale].site.meta.homeTitle);
  });
});
