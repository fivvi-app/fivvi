import { describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './layout';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => () => 'Fivvi',
  getLocale: async () => 'nl-NL',
}));

describe('F064 AC13 the app never reaches a search engine', () => {
  it('every page of the app, sign-in, booking and join pages included, says noindex, nofollow', async () => {
    const metadata = await generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe('Fivvi');
  });
});
