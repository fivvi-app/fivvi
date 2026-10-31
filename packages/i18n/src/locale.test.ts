import { describe, expect, it } from 'vitest';
import {
  matchLocale,
  parseAcceptLanguage,
  resolveClientCommunicationLanguage,
  resolveCommunicationLanguage,
  resolveInterfaceLanguage,
  resolveSignInCommunicationLanguage,
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
    const germanReader = { requested: ['de-DE'], workspaceDefault: 'nl-NL' };
    expect(resolveInterfaceLanguage(germanReader)).toBe('en');
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

// ADR-019: an email outside a workspace (the sign-in email) has no workspace default.
describe('F001 AC9: communication language order for sign-in emails (ADR-019)', () => {
  it('uses the stored preference, also when the page is in another language', () => {
    expect(
      resolveSignInCommunicationLanguage({
        recipientPreference: 'en',
        page: { explicit: 'nl-NL' },
      }),
    ).toBe('en');
    expect(
      resolveSignInCommunicationLanguage({
        recipientPreference: 'nl-BE',
        page: { explicit: 'en', requested: ['en-GB'] },
      }),
    ).toBe('nl-NL');
  });

  it.each([
    ['no stored preference', null],
    ['no stored preference at all', undefined],
    ['an unsupported stored preference', 'de-DE'],
  ])('uses the language of the requesting page for %s', (_, recipientPreference) => {
    expect(
      resolveSignInCommunicationLanguage({ recipientPreference, page: { explicit: 'nl-NL' } }),
    ).toBe('nl-NL');
    expect(
      resolveSignInCommunicationLanguage({ recipientPreference, page: { explicit: 'en' } }),
    ).toBe('en');
  });

  it('falls back like the interface language when the page says nothing: browser, then English', () => {
    expect(
      resolveSignInCommunicationLanguage({
        recipientPreference: null,
        page: { requested: ['nl'] },
      }),
    ).toBe('nl-NL');
    expect(resolveSignInCommunicationLanguage({ page: {} })).toBe('en');
  });
});

// F010 AC6: one test per case of ADR-017's order, named as in the spec. The native apps mirror
// these names in their own tests.
describe('AC6: explicit, stored, device, English', () => {
  it('explicit: a choice made now wins over a stored preference and the device', () => {
    expect(
      resolveInterfaceLanguage({ explicit: 'en', stored: 'nl-NL', requested: ['nl-NL'] }),
    ).toBe('en');
  });

  it('stored: the stored preference wins over the device languages', () => {
    expect(resolveInterfaceLanguage({ stored: 'en', requested: ['nl-NL'] })).toBe('en');
    expect(resolveInterfaceLanguage({ stored: 'nl-NL', requested: ['en-GB'] })).toBe('nl-NL');
  });

  it('device: the first supported device or browser language decides without a choice', () => {
    expect(resolveInterfaceLanguage({ requested: ['fr-FR', 'nl-BE', 'en-GB'] })).toBe('nl-NL');
  });

  it('English: nothing supported is chosen, stored or requested', () => {
    expect(resolveInterfaceLanguage({ requested: ['de-DE'] })).toBe('en');
    expect(resolveInterfaceLanguage({})).toBe('en');
  });
});

// F006 AC11 (ADR-017, owner decision 4): the language of an email to a client of a workspace.
describe('AC11: client communication language: account preference, client language, workspace default', () => {
  it('uses the linked account’s own preference before the language the team set', () => {
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: 'en',
        clientLanguage: 'nl-NL',
        workspaceDefault: 'nl-NL',
      }),
    ).toBe('en');
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: 'nl-NL',
        clientLanguage: 'en',
        workspaceDefault: 'en',
      }),
    ).toBe('nl-NL');
  });

  it('uses the client’s language for emails when the account has no preference', () => {
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: null,
        clientLanguage: 'en',
        workspaceDefault: 'nl-NL',
      }),
    ).toBe('en');
  });

  it('uses the client’s language, then the workspace default, without a linked account', () => {
    expect(
      resolveClientCommunicationLanguage({ clientLanguage: 'en', workspaceDefault: 'nl-NL' }),
    ).toBe('en');
    expect(
      resolveClientCommunicationLanguage({ clientLanguage: null, workspaceDefault: 'nl-NL' }),
    ).toBe('nl-NL');
    expect(resolveClientCommunicationLanguage({ workspaceDefault: 'en' })).toBe('en');
  });

  it('uses the workspace default when neither the account nor the client has a language', () => {
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: undefined,
        clientLanguage: undefined,
        workspaceDefault: 'en',
      }),
    ).toBe('en');
  });

  it('skips a language that is not supported and follows the next step', () => {
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: 'de-DE',
        clientLanguage: 'nl-BE',
        workspaceDefault: 'en',
      }),
    ).toBe('nl-NL');
    expect(
      resolveClientCommunicationLanguage({
        accountPreference: 'de-DE',
        clientLanguage: 'fr',
        workspaceDefault: 'en',
      }),
    ).toBe('en');
  });

  it('never uses the device languages of the client', () => {
    const sources = { requested: ['en-GB'], workspaceDefault: 'nl-NL' } as const;
    expect(resolveClientCommunicationLanguage(sources)).toBe('nl-NL');
  });
});
