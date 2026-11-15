import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { emailChangeTakenNoticeEmail } from './email-change-taken-notice.tsx';

describe('F005 EM-36 notice to an address that already has an account', () => {
  it.each(locales)(
    'AC8: renders in %s and says no code was sent and nothing changed',
    async (locale) => {
      const copy = messages[locale].email.emailChangeTaken;
      const email = await renderEmail(emailChangeTakenNoticeEmail, {}, { locale });

      expect(email.subject).toBe(copy.subject);
      expect(email.html).toContain(`<title>${copy.subject}</title>`);
      for (const part of [email.html, email.text]) {
        expect(part.replaceAll('&#x27;', "'")).toContain(copy.intro);
      }
      expect(email.text).toContain(copy.unchanged);
    },
  );

  it.each(locales)('AC8: %s carries no code, link or button', async (locale) => {
    const email = await renderEmail(emailChangeTakenNoticeEmail, {}, { locale });

    expect(email.text).not.toMatch(/\b\d{6}\b/);
    expect(email.html).not.toMatch(/<a\s/);
    expect(email.html).not.toContain('<button');
  });

  it.each(locales)(
    '%s: uses every email.emailChangeTaken key, with its text rendered',
    async (locale) => {
      const email = await renderEmail(emailChangeTakenNoticeEmail, {}, { locale });
      const rendered = `${email.subject}\n${email.text}\n${email.html.replaceAll('&#x27;', "'")}`;
      const keys = Object.entries(messages[locale].email.emailChangeTaken);

      expect(keys.length).toBe(5);
      for (const [key, message] of keys) {
        expect(rendered, `${locale} email.emailChangeTaken.${key}`).toContain(message);
      }
    },
  );
});
