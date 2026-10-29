import { messages } from '@fivvi/i18n';
import { createFormatter, createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { catalogLocale, intlConfig, requestLocale } from './config';

describe('E005 web request locale', () => {
  it('uses the language cookie before the browser languages', () => {
    expect(requestLocale('en', 'nl-NL,nl;q=0.9')).toBe('en');
    expect(requestLocale('nl-NL', 'en-US,en;q=0.9')).toBe('nl-NL');
  });

  it('falls back to the first supported browser language, then to English (E008 AC3)', () => {
    expect(requestLocale(undefined, 'de-DE,de;q=0.9,en;q=0.8')).toBe('en');
    expect(requestLocale(undefined, 'fr-FR,nl-BE;q=0.9')).toBe('nl-NL');
    expect(requestLocale('fr', 'nl-BE')).toBe('nl-NL');
    expect(requestLocale(undefined, 'de-DE')).toBe('en');
    expect(requestLocale('fr', 'de-DE')).toBe('en');
    expect(requestLocale(undefined, null)).toBe('en');
  });

  it('F010: maps the formatting locale back to the catalog locale', () => {
    expect(catalogLocale(intlConfig('nl-NL').locale)).toBe('nl-NL');
    expect(catalogLocale(intlConfig('en').locale)).toBe('en');
  });

  it('runs next-intl on the formatting locale', () => {
    expect(intlConfig('nl-NL').locale).toBe('nl-NL');
    expect(intlConfig('en').locale).toBe('en-GB');
    expect(intlConfig('en').messages).toBe(messages.en);
  });
});

describe('E005 seed messages through next-intl', () => {
  const setup = (locale: 'nl-NL' | 'en') => {
    const config = intlConfig(locale);
    return {
      t: createTranslator({ ...config, namespace: 'hello' }),
      format: createFormatter(config),
    };
  };

  it.each([
    ['nl-NL', 1, 'Je hebt vandaag 1 sessie.'],
    ['nl-NL', 3, 'Je hebt vandaag 3 sessies.'],
    ['en', 1, 'You have 1 session today.'],
    ['en', 3, 'You have 3 sessions today.'],
  ] as const)('%s plural with count %i', (locale, count, expected) => {
    expect(setup(locale).t('sessionsToday', { count })).toBe(expected);
  });

  it.each([
    ['nl-NL', 'Je volgende sessie is op dinsdag 22 september om 18:00.'],
    ['en', 'Your next session is on Tuesday 22 September at 18:00.'],
  ] as const)('%s date and time in Europe/Amsterdam', (locale, expected) => {
    const { t, format } = setup(locale);
    const start = new Date('2026-09-22T16:00:00Z');
    expect(
      t('nextSession', {
        date: format.dateTime(start, 'date'),
        time: format.dateTime(start, 'time'),
      }),
    ).toBe(expected);
  });
});
