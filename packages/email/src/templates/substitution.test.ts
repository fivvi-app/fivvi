import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { type SubstitutionEmailProps, substitutionEmail } from './substitution.tsx';

// F024 (spec #461, ticket #552), EM-10: the notice to the trainer who covers one class date.
// Synthetic data: John's Gym, Kracht / Strength on Tuesday 20 October 2026 at 18:00 in Amsterdam
// (CEST, UTC+2), Mike covering for Sarah.

const location = 'John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam';

const kracht: SubstitutionEmailProps = {
  workspaceName: 'John’s Gym',
  workspaceSlug: 'johns-gym',
  sessionId: '00000000-0000-4000-8000-000000000001',
  className: 'Kracht',
  classNameEn: null,
  startsAt: new Date('2026-10-20T16:00:00Z'),
  endsAt: new Date('2026-10-20T17:00:00Z'),
  location,
  originalName: 'Sarah',
};

describe('F024 EM-10 substitution email', () => {
  it.each([
    ['nl-NL', 'Je valt in: Kracht op dinsdag 20 oktober'],
    ['en', "You're covering: Kracht on Tuesday 20 October"],
  ] as const)('AC2: %s names the class and the date in the subject', async (locale, subject) => {
    const email = await renderEmail(substitutionEmail, kracht, { locale });

    expect(email.subject).toBe(subject);
    expect(email.html).toContain('<title>');
  });

  it.each([
    [
      'nl-NL',
      [
        'Je valt in voor Sarah: Kracht bij John’s Gym.',
        'Wanneer: dinsdag 20 oktober 2026, 18:00 tot 19:00',
        `Waar: ${location}`,
        'In Fivvi bekijken',
      ],
    ],
    [
      'en',
      [
        "You're covering for Sarah: Kracht at John’s Gym.",
        'When: Tuesday, 20 October 2026, 18:00 to 19:00',
        `Where: ${location}`,
        'View in Fivvi',
      ],
    ],
  ] as const)(
    'AC2: %s gives the class, the time, the location, who they cover for and the button',
    async (locale, lines) => {
      const email = await renderEmail(substitutionEmail, kracht, { locale });

      for (const line of lines) expect(email.text).toContain(line);
      // The button opens the class date's page on the web.
      expect(email.html).toContain(
        'href="https://fivvi.app/w/johns-gym/sessions/00000000-0000-4000-8000-000000000001"',
      );
    },
  );

  it('AC2: shows the class in the recipient’s language when there is an English name', async () => {
    const english = await renderEmail(
      substitutionEmail,
      { ...kracht, classNameEn: 'Strength' },
      { locale: 'en' },
    );
    const dutch = await renderEmail(
      substitutionEmail,
      { ...kracht, classNameEn: 'Strength' },
      { locale: 'nl-NL' },
    );

    expect(english.subject).toBe("You're covering: Strength on Tuesday 20 October");
    expect(dutch.subject).toBe('Je valt in: Kracht op dinsdag 20 oktober');
  });

  it.each(locales)(
    '%s: leaves the "covering for" name out when the account has none',
    async (locale) => {
      const email = await renderEmail(
        substitutionEmail,
        { ...kracht, originalName: null },
        { locale },
      );

      expect(email.text).not.toContain('Sarah');
      expect(email.text).toContain('Kracht');
      expect(email.text).not.toMatch(/@/);
    },
  );

  it('AC2: the Dutch wording covers the class, never the person the class is named after', async () => {
    const withName = await renderEmail(substitutionEmail, kracht, { locale: 'nl-NL' });
    const withoutName = await renderEmail(
      substitutionEmail,
      { ...kracht, originalName: null },
      { locale: 'nl-NL' },
    );

    expect(withName.html).toContain('Je valt in bij Kracht op dinsdag 20 oktober om 18:00.');
    expect(withoutName.text).toContain('Je valt in: Kracht bij John’s Gym.');
    expect(withoutName.text).not.toContain('Je valt in voor Kracht');
  });

  it('shows the times in the time zone it is given, not in UTC', async () => {
    const utc = await renderEmail(substitutionEmail, kracht, { locale: 'en', timeZone: 'UTC' });

    expect(utc.text).toContain('16:00 to 17:00');
  });

  it.each([
    ['nl-NL', 'Je krijgt deze e-mail omdat je in het team van'],
    ['en', "You're getting this email because you're on the team at"],
  ] as const)('the frame is the team frame in %s', async (locale, footer) => {
    const email = await renderEmail(substitutionEmail, kracht, { locale });

    expect(email.text.startsWith(kracht.workspaceName)).toBe(true);
    expect(email.text).toContain(`${footer} ${kracht.workspaceName}`);
  });
});
