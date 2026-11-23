import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { privateSessionCancelledEmail } from './private-session-cancelled.tsx';

// F026 (spec #462, ticket #557), EM-05 private-session variant. Synthetic data: John's Gym, Sarah,
// Thursday 24 September 2026, 09:00 to 10:00 in Amsterdam (CEST, UTC+2).

const props = {
  workspaceName: 'John’s Gym',
  startsAt: new Date('2026-09-24T07:00:00Z'),
  endsAt: new Date('2026-09-24T08:00:00Z'),
  locationName: 'John’s Gym',
  locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
  trainerName: 'Sarah',
  trainerWord: 'trainer' as const,
};

describe('F026 EM-05 private session cancelled email', () => {
  it.each([
    ['nl-NL', 'Je sessie op donderdag 24 september om 09:00 is geannuleerd'],
    ['en', 'Your session on Thursday 24 September at 09:00 has been cancelled'],
  ] as const)('AC2: %s has the date and the time in the subject', async (locale, subject) => {
    const email = await renderEmail(privateSessionCancelledEmail, props, { locale });

    expect(email.subject).toBe(subject);
    expect(email.html).toContain(`<title>${subject}</title>`);
  });

  it.each([
    [
      'nl-NL',
      [
        'Je privésessie bij John’s Gym is geannuleerd.',
        'Gepland was: donderdag 24 september 2026, 09:00 tot 10:00',
        'Waar: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
    [
      'en',
      [
        'Your private session at John’s Gym has been cancelled.',
        'It was planned for: Thursday, 24 September 2026, 09:00 to 10:00',
        'Where: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
        'Trainer: Sarah',
      ],
    ],
  ] as const)(
    'AC12: %s gives the date, the time, the location and the trainer',
    async (locale, lines) => {
      const email = await renderEmail(privateSessionCancelledEmail, props, { locale });

      for (const line of lines) expect(email.text).toContain(line);
    },
  );

  it('F068: names the role with the workspace’s word', async () => {
    const email = await renderEmail(
      privateSessionCancelledEmail,
      { ...props, trainerWord: 'instructeur' as const },
      { locale: 'nl-NL' },
    );

    expect(email.text).toContain('Instructeur: Sarah');
  });

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const utc = await renderEmail(privateSessionCancelledEmail, props, {
      locale: 'en',
      timeZone: 'UTC',
    });

    expect(utc.subject).toBe('Your session on Thursday 24 September at 07:00 has been cancelled');
  });

  it.each(locales)(
    '%s: leaves the address and the trainer out when there are none, and names no email address or booking link',
    async (locale) => {
      const copy = messages[locale].email.privateSession;
      const email = await renderEmail(
        privateSessionCancelledEmail,
        { ...props, locationAddress: null, trainerName: null },
        { locale },
      );

      expect(email.text).toContain(copy.where.replace('{location}', 'John’s Gym'));
      expect(email.text).not.toContain('Voorbeeldstraat');
      expect(email.text).not.toContain('Sarah');
      expect(email.text).not.toMatch(/@/);
    },
  );

  it('renders a name with markup as text', async () => {
    const email = await renderEmail(
      privateSessionCancelledEmail,
      { ...props, trainerName: '<b>Sarah</b>' },
      { locale: 'en' },
    );

    expect(email.html).not.toContain('<b>Sarah</b>');
    expect(email.html).toContain('&lt;b&gt;Sarah&lt;/b&gt;');
  });

  it.each([
    ['nl-NL', 'Je krijgt deze e-mail omdat je klant bent bij'],
    ['en', "You're getting this email because you're a client of"],
  ] as const)('the frame is the client frame in %s', async (locale, footer) => {
    const email = await renderEmail(privateSessionCancelledEmail, props, { locale });

    expect(email.text.startsWith(props.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${props.workspaceName}.`);
  });
});
