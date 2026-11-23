import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { type TrainerChangeEmailProps, trainerChangeEmail } from './trainer-change.tsx';

// F023 (spec #459, ticket #536), EM-13: the client's notice that the trainer of a private session or
// of class dates changed. Synthetic data: John's Gym, Kracht / Strength, Tom, Tuesday 13 and 20 October
// 2026 at 18:00 in Amsterdam (CEST, UTC+2); Thursday 24 September 2026, 09:00.

const location = 'John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam';

const privateSession: TrainerChangeEmailProps = {
  workspaceName: 'John’s Gym',
  kind: 'private',
  className: null,
  classNameEn: null,
  location,
  dates: [
    {
      startsAt: new Date('2026-09-24T07:00:00Z'),
      endsAt: new Date('2026-09-24T08:00:00Z'),
    },
  ],
  trainerName: 'Tom',
  trainerWord: 'trainer',
};

const oneClassDate: TrainerChangeEmailProps = {
  ...privateSession,
  kind: 'class',
  className: 'Kracht',
  classNameEn: 'Strength',
  dates: [
    {
      startsAt: new Date('2026-10-13T16:00:00Z'),
      endsAt: new Date('2026-10-13T17:00:00Z'),
    },
  ],
};

const severalClassDates: TrainerChangeEmailProps = {
  ...oneClassDate,
  dates: [
    ...oneClassDate.dates,
    {
      startsAt: new Date('2026-10-20T16:00:00Z'),
      endsAt: new Date('2026-10-20T17:00:00Z'),
    },
  ],
};

describe('F023 EM-13 trainer change email', () => {
  it.each([
    ['nl-NL', 'Andere trainer: je sessie op donderdag 24 september'],
    ['en', 'New trainer: your session on Thursday 24 September'],
  ] as const)(
    'AC8: %s names the date of a private session in the subject',
    async (locale, subject) => {
      const email = await renderEmail(trainerChangeEmail, privateSession, { locale });

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`<title>${subject}</title>`);
    },
  );

  it.each([
    ['nl-NL', 'Andere trainer: Kracht op dinsdag 13 oktober'],
    ['en', 'New trainer: Strength on Tuesday 13 October'],
  ] as const)(
    'AC17: %s names the class and the date of one class date',
    async (locale, subject) => {
      const email = await renderEmail(trainerChangeEmail, oneClassDate, { locale });

      expect(email.subject).toBe(subject);
    },
  );

  it.each([
    ['nl-NL', 'Andere trainer: Kracht vanaf dinsdag 13 oktober'],
    ['en', 'New trainer: Strength from Tuesday 13 October'],
  ] as const)(
    'AC17: %s says "from" when the email lists several dates',
    async (locale, subject) => {
      const email = await renderEmail(trainerChangeEmail, severalClassDates, { locale });

      expect(email.subject).toBe(subject);
    },
  );

  it.each([
    [
      'nl-NL',
      [
        'De trainer van je privésessie bij John’s Gym is veranderd.',
        'Wanneer: donderdag 24 september 2026, 09:00 tot 10:00',
        `Waar: ${location}`,
        'Je traint nu met Tom.',
        'Verder verandert er niets.',
      ],
    ],
    [
      'en',
      [
        'The trainer of your private session at John’s Gym has changed.',
        'When: Thursday, 24 September 2026, 09:00 to 10:00',
        `Where: ${location}`,
        "You'll now train with Tom.",
        'Nothing else changes.',
      ],
    ],
  ] as const)(
    'AC8: %s gives the date, the time, the location and the new trainer of a private session',
    async (locale, lines) => {
      const email = await renderEmail(trainerChangeEmail, privateSession, { locale });

      for (const line of lines) expect(email.text).toContain(line);
    },
  );

  it.each([
    [
      'nl-NL',
      [
        'De trainer van Kracht bij John’s Gym is veranderd.',
        'Dit geldt voor:',
        'dinsdag 13 oktober 2026, 18:00 tot 19:00',
        'dinsdag 20 oktober 2026, 18:00 tot 19:00',
        `Waar: ${location}`,
        'Je traint nu met Tom.',
      ],
    ],
    [
      'en',
      [
        'The trainer of Strength at John’s Gym has changed.',
        'This applies to:',
        'Tuesday, 13 October 2026, 18:00 to 19:00',
        'Tuesday, 20 October 2026, 18:00 to 19:00',
        `Where: ${location}`,
        "You'll now train with Tom.",
      ],
    ],
  ] as const)('AC17: %s lists every affected date in one email', async (locale, lines) => {
    const email = await renderEmail(trainerChangeEmail, severalClassDates, { locale });

    for (const line of lines) expect(email.text).toContain(line);
  });

  it('AC17: a date held somewhere else says where', async () => {
    const email = await renderEmail(
      trainerChangeEmail,
      {
        ...severalClassDates,
        dates: [
          ...severalClassDates.dates.slice(0, 1),
          {
            ...(severalClassDates.dates[1] as (typeof severalClassDates.dates)[number]),
            elsewhere: 'Park, Parkweg 2, 1234 AB Amsterdam',
          },
        ],
      },
      { locale: 'nl-NL' },
    );

    expect(email.text).toContain(
      'dinsdag 20 oktober 2026, 18:00 tot 19:00, Park, Parkweg 2, 1234 AB Amsterdam',
    );
    expect(email.text).toContain('dinsdag 13 oktober 2026, 18:00 tot 19:00');
  });

  it('AC17: a one-date class email has the date and the location, not a list', async () => {
    const email = await renderEmail(trainerChangeEmail, oneClassDate, { locale: 'nl-NL' });

    expect(email.text).toContain('Wanneer: dinsdag 13 oktober 2026, 18:00 tot 19:00');
    expect(email.text).not.toContain('Dit geldt voor:');
  });

  it.each(locales)(
    '%s: names no email address and leaves the trainer line out without a name',
    async (locale) => {
      const email = await renderEmail(
        trainerChangeEmail,
        { ...privateSession, trainerName: null },
        { locale },
      );

      expect(email.text).not.toContain('Tom');
      expect(email.text).not.toMatch(/@/);
    },
  );

  it('F068: names the role with the workspace’s word', async () => {
    const email = await renderEmail(
      trainerChangeEmail,
      { ...privateSession, trainerWord: 'instructeur' },
      { locale: 'nl-NL' },
    );

    expect(email.subject).toBe('Andere trainer: je sessie op donderdag 24 september');
    expect(email.text).toContain('De instructeur van je privésessie');
  });

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const utc = await renderEmail(trainerChangeEmail, privateSession, {
      locale: 'en',
      timeZone: 'UTC',
    });

    expect(utc.text).toContain('07:00 to 08:00');
  });

  it('shows the class in the recipient’s language when there is an English name', async () => {
    const dutch = await renderEmail(trainerChangeEmail, oneClassDate, { locale: 'nl-NL' });
    const english = await renderEmail(trainerChangeEmail, oneClassDate, { locale: 'en' });
    const noEnglish = await renderEmail(
      trainerChangeEmail,
      { ...oneClassDate, classNameEn: null },
      { locale: 'en' },
    );

    expect(dutch.subject).toContain('Kracht');
    expect(english.subject).toContain('Strength');
    expect(noEnglish.subject).toContain('Kracht');
  });

  it.each([
    ['nl-NL', 'Je krijgt deze e-mail omdat je klant bent bij'],
    ['en', "You're getting this email because you're a client of"],
  ] as const)('the frame is the client frame in %s', async (locale, footer) => {
    const email = await renderEmail(trainerChangeEmail, privateSession, { locale });

    expect(email.text.startsWith(privateSession.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${privateSession.workspaceName}.`);
  });
});
