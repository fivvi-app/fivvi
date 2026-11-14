import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { emailChangedNoticeEmail } from './email-changed-notice.tsx';

describe('F005 EM-35 email-changed notice', () => {
  it.each(locales)(
    'AC3: renders in %s with what happened and what to do if it was not them',
    async (locale) => {
      const copy = messages[locale].email.emailChanged;
      const email = await renderEmail(emailChangedNoticeEmail, {}, { locale });

      expect(email.subject).toBe(copy.subject);
      expect(email.html).toContain(`<title>${copy.subject}</title>`);
      for (const part of [email.html, email.text]) {
        expect(part.replaceAll('&#x27;', "'")).toContain(copy.intro);
      }
      expect(email.text).toContain(copy.notYou);
    },
  );

  it.each(locales)('AC3: %s has no link or button that could undo the change', async (locale) => {
    const email = await renderEmail(emailChangedNoticeEmail, {}, { locale });

    expect(email.html).not.toMatch(/<a\s/);
    expect(email.html).not.toContain('<button');
    expect(email.text).not.toMatch(/https?:\/\//);
  });

  it.each(locales)(
    '%s: uses every email.emailChanged key, with its text rendered',
    async (locale) => {
      const email = await renderEmail(emailChangedNoticeEmail, {}, { locale });
      const rendered = `${email.subject}\n${email.text}\n${email.html.replaceAll('&#x27;', "'")}`;
      const keys = Object.entries(messages[locale].email.emailChanged);

      expect(keys.length).toBe(5);
      for (const [key, message] of keys) {
        expect(rendered, `${locale} email.emailChanged.${key}`).toContain(message);
      }
    },
  );

  it('follows the glossary: e-mailadres in Dutch, email address in English', async () => {
    const nl = await renderEmail(emailChangedNoticeEmail, {}, { locale: 'nl-NL' });
    const en = await renderEmail(emailChangedNoticeEmail, {}, { locale: 'en' });

    expect(nl.text).toContain('e-mailadres');
    expect(nl.text).not.toMatch(/verifi|token|OTP|pincode|mailadres\b(?<!e-mailadres)/i);
    expect(en.text).toContain('email address');
  });
});
