import { describe, expect, it } from 'vitest';
import { matchLocale, parseAcceptLanguage, resolveLocale } from './locale.ts';

describe('E005 locale resolution', () => {
  it.each([
    ['nl-NL', 'nl-NL'],
    ['nl', 'nl-NL'],
    ['nl-BE', 'nl-NL'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['EN_gb', 'en'],
    ['de-DE', undefined],
    ['', undefined],
    [null, undefined],
  ])('matches %j to %j', (tag, locale) => {
    expect(matchLocale(tag)).toBe(locale);
  });

  it('orders Accept-Language by quality, then by position', () => {
    expect(parseAcceptLanguage('de;q=0.9, en-GB, fr;q=0, nl;q=0.9, *;q=0.1')).toEqual([
      'en-GB',
      'de',
      'nl',
    ]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });

  it('follows explicit choice → stored preference → workspace default → device → nl-NL', () => {
    const all = { explicit: 'en', stored: 'nl-NL', workspaceDefault: 'nl-NL', requested: ['nl'] };
    expect(resolveLocale(all)).toBe('en');
    expect(resolveLocale({ ...all, explicit: null })).toBe('nl-NL');
    expect(resolveLocale({ stored: 'en', workspaceDefault: 'nl-NL' })).toBe('en');
    expect(resolveLocale({ workspaceDefault: 'en', requested: ['nl-BE'] })).toBe('en');
    expect(resolveLocale({ requested: ['de', 'en-US', 'nl'] })).toBe('en');
    expect(resolveLocale({ explicit: 'fr', requested: ['de'] })).toBe('nl-NL');
    expect(resolveLocale({})).toBe('nl-NL');
  });
});
