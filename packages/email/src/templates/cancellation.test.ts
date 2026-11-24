import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { cancellationEmail } from './cancellation.tsx';

// F026 (spec #462, ticket #557), EM-05 private-session variant. Synthetic data: John's Gym, Sarah,
// Thursday 24 September 2026, 09:00 to 10:00 in Amsterdam (CEST, UTC+2).

const props = {
  kind: 'private' as const,
  className: null,
  classNameEn: null,
  message: null,
  workspaceName: 'John’s Gym',
  startsAt: new Date('2026-09-24T07:00:00Z'),
  endsAt: new Date('2026-09-24T08:00:00Z'),
  locationName: 'John’s Gym',
  locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
  trainerName: 'Sarah',
  trainerWord: 'trainer' as const,
};

describe('F026 EM-05 private-session variant', () => {
  it.each([
    ['nl-NL', 'Je sessie op donderdag 24 september om 09:00 is geannuleerd'],
    ['en', 'Your session on Thursday 24 September at 09:00 has been cancelled'],
  ] as const)('AC2: %s has the date and the time in the subject', async (locale, subject) => {
    const email = await renderEmail(cancellationEmail, props, { locale });

    expect(email.subject).toBe(subject);
    expect(email.html).toContain(`<title>${subject}</title>`);
  });

  it.each([
    [
      'nl-NL',
      [
        'Je privésessie bij John’s Gym is geannuleerd.',
        'Het stond gepland op: donderdag 24 september 2026, 09:00 tot 10:00',
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
      const email = await renderEmail(cancellationEmail, props, { locale });

      for (const line of lines) expect(email.text).toContain(line);
    },
  );

  it('F068: names the role with the workspace’s word', async () => {
    const email = await renderEmail(
      cancellationEmail,
      { ...props, trainerWord: 'instructeur' as const },
      { locale: 'nl-NL' },
    );

    expect(email.text).toContain('Instructeur: Sarah');
  });

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const utc = await renderEmail(cancellationEmail, props, {
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
        cancellationEmail,
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
      cancellationEmail,
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
    const email = await renderEmail(cancellationEmail, props, { locale });

    expect(email.text.startsWith(props.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${props.workspaceName}.`);
  });
});

// The class variant (ticket #558): Kracht on Tuesday 20 October 2026, 18:00 to 19:00 in Amsterdam
// (CEST until 25 October, UTC+2), cancelled by John's Gym.

const classProps = {
  ...props,
  kind: 'class' as const,
  startsAt: new Date('2026-10-20T16:00:00Z'),
  endsAt: new Date('2026-10-20T17:00:00Z'),
  trainerName: null,
  className: 'Kracht',
  classNameEn: 'Strength',
  message: 'Sarah is ziek, sorry!',
};

describe('F026 EM-05 class variant', () => {
  it.each([
    ['nl-NL', 'Kracht op dinsdag 20 oktober gaat niet door'],
    ['en', 'Strength on Tuesday 20 October is cancelled'],
  ] as const)(
    'AC6: %s names the class in the reader’s language and the date in the subject',
    async (locale, subject) => {
      const email = await renderEmail(cancellationEmail, classProps, { locale });

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`<title>${subject}</title>`);
    },
  );

  it('AC6: a class with no English name shows the Dutch name to a reader of English', async () => {
    const email = await renderEmail(
      cancellationEmail,
      { ...classProps, classNameEn: null },
      { locale: 'en' },
    );

    expect(email.subject).toBe('Kracht on Tuesday 20 October is cancelled');
  });

  it.each([
    [
      'nl-NL',
      [
        'Helaas gaat Kracht op dinsdag 20 oktober 2026 om 18:00 niet door. Je boeking is geannuleerd.',
        'Bericht van John’s Gym:',
        'Sarah is ziek, sorry!',
        'Waar: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
      ],
    ],
    [
      'en',
      [
        'Unfortunately Strength on Tuesday, 20 October 2026 at 18:00 is cancelled. Your booking has been cancelled.',
        'Message from John’s Gym:',
        'Sarah is ziek, sorry!',
        'Where: John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
      ],
    ],
  ] as const)(
    'AC6: %s says the booking is cancelled, quotes the message as typed (never translated) and gives the location',
    async (locale, lines) => {
      const email = await renderEmail(cancellationEmail, classProps, { locale });

      for (const line of lines) expect(email.text).toContain(line);
      // The message sits after the line that introduces it, and before the location.
      const order = [lines[1], lines[2], lines[3]].map((line) => email.text.indexOf(line));
      expect(order).toEqual(order.toSorted((a, b) => a - b));
    },
  );

  it.each(locales)('%s leaves the message block out when none was typed', async (locale) => {
    const email = await renderEmail(
      cancellationEmail,
      { ...classProps, message: null },
      { locale },
    );

    const heading = messages[locale].email.cancellation.messageFrom.replace('{workspace}:', '');
    expect(email.text).not.toContain(heading.trim());
    expect(email.text).not.toContain('Sarah is ziek');
    expect(email.text).toContain('Voorbeeldstraat');
  });

  it('AC12: the message is escaped and shown as typed, with its line breaks, in both languages', async () => {
    const typed = '<b>Tot dan</b> & "welkom"\nTweede regel';
    for (const locale of locales) {
      const email = await renderEmail(
        cancellationEmail,
        { ...classProps, message: typed },
        { locale },
      );

      expect(email.html).not.toContain('<b>Tot dan</b>');
      expect(email.html).toContain('&lt;b&gt;Tot dan&lt;/b&gt; &amp; &quot;welkom&quot;');
      expect(email.html).toContain('white-space:pre-wrap');
      expect(email.text).toContain('<b>Tot dan</b> & "welkom"');
    }
  });

  it('names no email address, no trainer and no booking link', async () => {
    const email = await renderEmail(
      cancellationEmail,
      { ...classProps, trainerName: 'Sarah' },
      { locale: 'en' },
    );

    expect(email.text).not.toMatch(/@/);
    expect(email.text).not.toContain('Trainer:');
    expect(email.text).not.toContain('Sarah:');
  });

  it.each([
    ['nl-NL', 'Je krijgt deze e-mail omdat je klant bent bij'],
    ['en', "You're getting this email because you're a client of"],
  ] as const)('the frame is the client frame in %s', async (locale, footer) => {
    const email = await renderEmail(cancellationEmail, classProps, { locale });

    expect(email.text.startsWith(props.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${props.workspaceName}.`);
  });
});
