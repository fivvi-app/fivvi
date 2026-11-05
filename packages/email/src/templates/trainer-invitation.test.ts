import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { trainerInvitationEmail } from './trainer-invitation.tsx';

const props = {
  inviterName: 'John',
  workspaceName: "John's Gym",
  url: 'https://fivvi.example.com/invitations/test-token',
  // 23:30 UTC on 12 November is 00:30 on 13 November in Amsterdam (CET, UTC+1).
  expiresAt: new Date('2026-11-12T23:30:00Z'),
};

describe('F011 EM-09 trainer invitation email', () => {
  it.each([
    ['nl-NL', 'John nodigt je uit voor John’s Gym'],
    ['en', 'John invited you to John’s Gym'],
  ] as const)(
    'AC1: %s says who invites to which workspace in the subject',
    async (locale, subject) => {
      const email = await renderEmail(
        trainerInvitationEmail,
        { ...props, workspaceName: 'John’s Gym' },
        { locale },
      );

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`<title>${subject}</title>`);
    },
  );

  it.each(locales)(
    'AC1: %s has one sentence, the button with the link and the ignore line',
    async (locale) => {
      const copy = messages[locale].email.trainerInvitation;
      const email = await renderEmail(trainerInvitationEmail, props, { locale });

      expect(email.html).toContain(`href="${props.url}"`);
      expect(email.html).toContain(copy.button);
      expect(email.text).toContain(props.url);
      expect(email.text).toContain(copy.ignore);
    },
  );

  it.each([
    ['nl-NL', 'John nodigt je uit om trainer te worden bij John’s Gym.'],
    ['en', 'John invited you to become a trainer at John’s Gym.'],
  ] as const)(
    'AC1: %s names the inviter and the workspace in the sentence',
    async (locale, line) => {
      const email = await renderEmail(
        trainerInvitationEmail,
        { ...props, workspaceName: 'John’s Gym' },
        { locale },
      );

      expect(email.text).toContain(line);
    },
  );

  it.each([
    ['nl-NL', 'Deze uitnodiging is geldig tot vrijdag 13 november 2026.'],
    ['en', 'This invitation is valid until Friday, 13 November 2026.'],
  ] as const)(
    'AC1: %s gives the expiry date in the workspace’s time zone',
    async (locale, line) => {
      const email = await renderEmail(trainerInvitationEmail, props, {
        locale,
        timeZone: 'Europe/Amsterdam',
      });

      expect(email.text).toContain(line);
    },
  );

  it('shows the expiry in the zone it is given', async () => {
    const email = await renderEmail(trainerInvitationEmail, props, {
      locale: 'en',
      timeZone: 'UTC',
    });

    expect(email.text).toContain('valid until Thursday, 12 November 2026');
  });
});
