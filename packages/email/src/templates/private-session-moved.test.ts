import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { privateSessionMovedEmail } from './private-session-moved.tsx';

const props = {
  workspaceName: 'John’s Gym',
  // Was Thursday 24 September 2026, 09:00 to 10:00 in Amsterdam (CEST, UTC+2).
  previousStartsAt: new Date('2026-09-24T07:00:00Z'),
  previousEndsAt: new Date('2026-09-24T08:00:00Z'),
  // Now Friday 25 September 2026, 10:00 to 11:00.
  startsAt: new Date('2026-09-25T08:00:00Z'),
  endsAt: new Date('2026-09-25T09:00:00Z'),
  locationName: 'John’s Gym',
  locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
  trainerName: 'Sarah',
  trainerWord: 'trainer' as const,
};

describe('F020 EM-04 private session moved email', () => {
  it.each([
    ['nl-NL', 'Wijziging: je sessie is verplaatst naar vrijdag 25 september om 10:00'],
    ['en', 'Change: your session has moved to Friday 25 September at 10:00'],
  ] as const)(
    'AC6: %s has the new date and time in the subject, short enough for an inbox',
    async (locale, subject) => {
      const email = await renderEmail(privateSessionMovedEmail, props, { locale });

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`<title>${subject}</title>`);
    },
  );

  it.each([
    [
      'nl-NL',
      [
        'Je privésessie bij John’s Gym is verplaatst.',
        'Eerder: donderdag 24 september 2026, 09:00 tot 10:00',
        'Nieuw: vrijdag 25 september 2026, 10:00 tot 11:00',
        'Waar: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
    [
      'en',
      [
        'Your private session at John’s Gym has moved.',
        'Previously: Thursday, 24 September 2026, 09:00 to 10:00',
        'Now: Friday, 25 September 2026, 10:00 to 11:00',
        'Where: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
  ] as const)(
    'AC6: %s gives the old and new time, the location and the trainer',
    async (locale, lines) => {
      const email = await renderEmail(privateSessionMovedEmail, props, { locale });

      for (const line of lines) expect(email.text).toContain(line);
    },
  );

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const utc = await renderEmail(privateSessionMovedEmail, props, {
      locale: 'en',
      timeZone: 'UTC',
    });

    expect(utc.subject).toBe('Change: your session has moved to Friday 25 September at 08:00');
  });

  it.each(locales)(
    '%s: leaves the address and the trainer out when there are none',
    async (locale) => {
      const copy = messages[locale].email.privateSession;
      const email = await renderEmail(
        privateSessionMovedEmail,
        { ...props, locationAddress: null, trainerName: null },
        { locale },
      );

      expect(email.text).toContain(copy.where.replace('{location}', 'John’s Gym'));
      expect(email.text).not.toContain('Voorbeeldstraat');
      expect(email.text).not.toContain(copy.trainer.replace('{trainer}', ''));
    },
  );

  it('renders a name with markup as text', async () => {
    const email = await renderEmail(
      privateSessionMovedEmail,
      { ...props, trainerName: '<b>Sarah</b>' },
      { locale: 'en' },
    );

    expect(email.html).not.toContain('<b>Sarah</b>');
    expect(email.html).toContain('&lt;b&gt;Sarah&lt;/b&gt;');
  });

  it.each([
    ['nl-NL', 'Je krijgt deze e-mail omdat je klant bent bij'],
    ['en', "You're getting this email because you're a client of"],
  ] as const)('F049 AC3: the frame is the client frame in %s', async (locale, footer) => {
    const email = await renderEmail(privateSessionMovedEmail, props, { locale });

    expect(email.text.startsWith(props.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${props.workspaceName}.`);
    expect(email.html).toContain('href="https://fivvi.app/home"');
    expect(email.text).not.toContain(messages[locale].email.layout.footer);
  });
});
