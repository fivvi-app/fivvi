import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { privateSessionEmail } from './private-session.tsx';

const props = {
  workspaceName: "John's Gym",
  // Thursday 24 September 2026, 09:00 to 10:00 in Amsterdam (CEST, UTC+2).
  startsAt: new Date('2026-09-24T07:00:00Z'),
  endsAt: new Date('2026-09-24T08:00:00Z'),
  locationName: "John's Gym",
  locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
  trainerName: 'Sarah',
};

describe('F020 EM-11 private session email', () => {
  it.each([
    ['nl-NL', 'Nieuwe afspraak: donderdag 24 september om 09:00'],
    ['en', 'New appointment: Thursday 24 September at 09:00'],
  ] as const)('AC1: %s has the date and the time in the subject', async (locale, subject) => {
    const email = await renderEmail(privateSessionEmail, props, { locale });

    expect(email.subject).toBe(subject);
    expect(email.html).toContain(`<title>${subject}</title>`);
  });

  it.each([
    [
      'nl-NL',
      [
        'Er is een privésessie voor je gepland bij John’s Gym.',
        'Wanneer: donderdag 24 september 2026, 09:00 tot 10:00',
        'Waar: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
    [
      'en',
      [
        'A private session has been planned for you at John’s Gym.',
        'When: Thursday, 24 September 2026, 09:00 to 10:00',
        'Where: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
  ] as const)(
    'AC1: %s gives the date, the time, the location and the trainer',
    async (locale, lines) => {
      const email = await renderEmail(
        privateSessionEmail,
        { ...props, workspaceName: 'John’s Gym', locationName: 'John’s Gym' },
        { locale },
      );

      for (const line of lines) expect(email.text).toContain(line);
    },
  );

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const amsterdam = await renderEmail(privateSessionEmail, props, {
      locale: 'en',
      timeZone: 'Europe/Amsterdam',
    });
    const utc = await renderEmail(privateSessionEmail, props, { locale: 'en', timeZone: 'UTC' });

    expect(amsterdam.subject).toBe('New appointment: Thursday 24 September at 09:00');
    expect(utc.subject).toBe('New appointment: Thursday 24 September at 07:00');
  });

  it('shows the date of the day the session starts on, in the workspace’s time zone', async () => {
    // 23:30 to 01:00: in Amsterdam it starts on Thursday 24 September.
    const email = await renderEmail(
      privateSessionEmail,
      {
        ...props,
        startsAt: new Date('2026-09-24T21:30:00Z'),
        endsAt: new Date('2026-09-24T23:00:00Z'),
      },
      { locale: 'nl-NL' },
    );

    expect(email.subject).toBe('Nieuwe afspraak: donderdag 24 september om 23:30');
    expect(email.text).toContain('donderdag 24 september 2026, 23:30 tot 01:00');
  });

  it.each(locales)(
    '%s: leaves the address and the trainer out when there are none',
    async (locale) => {
      const copy = messages[locale].email.privateSession;
      const email = await renderEmail(
        privateSessionEmail,
        { ...props, locationAddress: null, trainerName: null },
        { locale },
      );

      expect(email.text).toContain(copy.where.replace('{location}', "John's Gym"));
      expect(email.text).not.toContain('Voorbeeldstraat');
      expect(email.text).not.toContain(copy.trainer.replace('{trainer}', ''));
    },
  );

  it('renders a name with markup as text', async () => {
    const email = await renderEmail(
      privateSessionEmail,
      { ...props, trainerName: '<b>Sarah</b>' },
      { locale: 'en' },
    );

    expect(email.html).not.toContain('<b>Sarah</b>');
    expect(email.html).toContain('&lt;b&gt;Sarah&lt;/b&gt;');
  });
});
