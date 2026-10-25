import { describe, expect, it } from 'vitest';
import {
  dateTimeFormats,
  defaultTimeZone,
  formattingLocales,
  type Locale,
  type MessageKey,
  messages,
} from './index.ts';

const format = (locale: Locale, name: keyof typeof dateTimeFormats, iso: string) =>
  new Intl.DateTimeFormat(formattingLocales[locale], {
    ...dateTimeFormats[name],
    timeZone: defaultTimeZone,
  }).format(new Date(iso));

describe('E005 date and time formatting (GLOSSARY.md §3)', () => {
  // 16:00 UTC is 18:00 in Amsterdam (CEST).
  it.each([
    ['nl-NL', 'date', 'dinsdag 22 september'],
    ['en', 'date', 'Tuesday 22 September'],
    ['nl-NL', 'dateWithYear', 'dinsdag 22 september 2026'],
    ['en', 'dateWithYear', 'Tuesday, 22 September 2026'],
    ['nl-NL', 'time', '18:00'],
    ['en', 'time', '18:00'],
  ] as const)('%s %s', (locale, name, expected) => {
    expect(format(locale, name, '2026-09-22T16:00:00Z')).toBe(expected);
  });

  it('formats in Europe/Amsterdam, not UTC, around midnight', () => {
    expect(format('nl-NL', 'date', '2026-09-22T22:30:00Z')).toBe('woensdag 23 september');
    expect(format('nl-NL', 'time', '2026-09-22T22:30:00Z')).toBe('00:30');
  });

  it('follows daylight saving time', () => {
    // Last Sunday of October: 18:00 local is 17:00 UTC after the change.
    expect(format('en', 'time', '2026-10-25T17:00:00Z')).toBe('18:00');
  });
});

describe('E005 typed keys', () => {
  it('has the same key tree in every locale', () => {
    const shape = (tree: object): unknown =>
      Object.fromEntries(
        Object.entries(tree).map(([k, v]) => [k, typeof v === 'string' ? true : shape(v)]),
      );
    expect(shape(messages.en)).toEqual(shape(messages['nl-NL']));
  });

  it('types keys as dot paths', () => {
    const key: MessageKey = 'hello.title';
    // @ts-expect-error unknown keys don't type-check
    const unknown: MessageKey = 'hello.missing';
    expect([key, unknown]).toHaveLength(2);
  });
});

describe('F001 native sign-in strings (AC9, AC10, AC14)', () => {
  it('words the signed-out notice as the spec and the glossary do (AC9)', () => {
    expect(messages['nl-NL'].signIn.signedOutNotice).toBe('Je bent uitgelogd. Log opnieuw in.');
    expect(messages.en.signIn.signedOutNotice).toBe("You've been signed out. Sign in again.");
  });

  it('names the signed-in address on the home placeholder with the email as the only placeholder', () => {
    expect(messages['nl-NL'].home.signedInAs).toBe('Ingelogd als {email}');
    expect(messages.en.home.signedInAs).toBe('Signed in as {email}');
  });

  it('tells the app user to enter the code, not to open the link (TM-01)', () => {
    expect(messages['nl-NL'].signIn.checkEmailBodyApp).toContain('{email}');
    expect(messages['nl-NL'].signIn.checkEmailBodyApp).not.toMatch(/link/i);
    expect(messages.en.signIn.checkEmailBodyApp).toContain('{email}');
    expect(messages.en.signIn.checkEmailBodyApp).not.toMatch(/link/i);
  });
});
