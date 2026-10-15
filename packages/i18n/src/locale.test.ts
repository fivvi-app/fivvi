import { describe, expect, it } from 'vitest';
import {
  matchLocale,
  parseAcceptLanguage,
  resolveCommunicationLanguage,
  resolveInterfaceLanguage,
} from './locale.ts';

describe('E005 locale matching', () => {
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
});

// ADR-017. The native apps mirror these cases in their own tests.
describe('E008 AC3 interface language', () => {
  it.each([
    [['fr-FR', 'nl-BE'], 'nl-NL'],
    [['de-DE', 'en-GB', 'nl-NL'], 'en'],
    [['nl'], 'nl-NL'],
    [['en-US', 'nl-NL'], 'en'],
  ])('takes the first supported device language of %j: %s', (requested, locale) => {
    expect(resolveInterfaceLanguage({ requested })).toBe(locale);
  });

  it.each([
    ['an empty list', []],
    ['only unsupported languages', ['de-DE', 'fr-FR']],
    ['no list', undefined],
  ])('falls back to English for %s', (_, requested) => {
    expect(resolveInterfaceLanguage({ requested })).toBe('en');
  });

  it('follows explicit choice → stored preference → booking link → device', () => {
    const all = { explicit: 'en', stored: 'nl-NL', bookingLink: 'en', requested: ['nl-BE'] };
    expect(resolveInterfaceLanguage(all)).toBe('en');
    expect(resolveInterfaceLanguage({ ...all, explicit: null })).toBe('nl-NL');
    expect(resolveInterfaceLanguage({ ...all, explicit: null, stored: null })).toBe('en');
    expect(
      resolveInterfaceLanguage({ ...all, explicit: null, stored: null, bookingLink: null }),
    ).toBe('nl-NL');
  });

  it('skips an unsupported explicit choice, stored preference or booking-link language', () => {
    expect(
      resolveInterfaceLanguage({
        explicit: 'fr',
        stored: 'de-DE',
        bookingLink: 'es',
        requested: ['nl-BE'],
      }),
    ).toBe('nl-NL');
    expect(resolveInterfaceLanguage({ explicit: 'fr', requested: ['de'] })).toBe('en');
  });

  it('is never decided by the workspace default communication language', () => {
    const guest = { requested: ['de-DE'], workspaceDefault: 'nl-NL' };
    expect(resolveInterfaceLanguage(guest)).toBe('en');
    const visitor = { requested: ['en-GB'], workspaceDefault: 'nl-NL' };
    expect(resolveInterfaceLanguage(visitor)).toBe('en');
  });
});

describe('E008 communication language', () => {
  it.each([
    ['en', 'nl-NL', 'en'],
    ['nl-BE', 'en', 'nl-NL'],
    [null, 'nl-NL', 'nl-NL'],
    [undefined, 'en', 'en'],
    ['de-DE', 'nl-NL', 'nl-NL'],
  ] as const)(
    'recipient preference %j with workspace default %s gives %s',
    (recipientPreference, workspaceDefault, locale) => {
      expect(resolveCommunicationLanguage({ recipientPreference, workspaceDefault })).toBe(locale);
    },
  );

  it('does not use the recipient device languages', () => {
    const recipient = { requested: ['en-GB'], workspaceDefault: 'nl-NL' } as const;
    expect(resolveCommunicationLanguage(recipient)).toBe('nl-NL');
  });
});
