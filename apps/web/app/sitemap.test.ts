import { describe, expect, it } from 'vitest';
import { sitemapEntries } from '../site/indexing';
import sitemap from './sitemap';

describe('F064 AC13 /sitemap.xml', () => {
  it('is the built pages in both languages with their alternates', () => {
    expect(sitemap()).toEqual(sitemapEntries());
    expect(sitemap().length).toBeGreaterThan(0);
  });
});
