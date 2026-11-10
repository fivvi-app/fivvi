import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { emailChangeCodeEmail } from './email-change-code.tsx';

const props = { code: '482915', expiresInMinutes: 15 };

describe('F005 EM-34 email-change code email', () => {
  it.each(locales)('AC1: renders in %s with the code and how long it works', async (locale) => {
    const copy = messages[locale].email.emailChangeCode;
    const email = await renderEmail(emailChangeCodeEmail, props, { locale });

    expect(email.subject).toBe(copy.subject);
    expect(email.html).toContain(`<title>${copy.subject}</title>`);
    for (const part of [email.html, email.text]) {
      expect(part).toContain('482915');
      expect(part).toContain(copy.intro);
    }
    expect(email.text).toContain(copy.ignore);
  });

  it.each(locales)('%s: has no link or button: the code is typed in the app', async (locale) => {
    const email = await renderEmail(emailChangeCodeEmail, props, { locale });

    expect(email.html).not.toMatch(/<a\s[^>]*href="https?:/);
    expect(email.html).not.toContain('<button');
  });

  it.each(locales)(
    '%s: uses every email.emailChangeCode key, with its text rendered',
    async (locale) => {
      const email = await renderEmail(emailChangeCodeEmail, props, { locale });
      const rendered = `${email.subject}\n${email.text}\n${email.html.replaceAll('&#x27;', "'")}`;
      const keys = Object.entries(messages[locale].email.emailChangeCode);

      expect(keys.length).toBe(5);
      for (const [key, message] of keys) {
        const open = message.indexOf('{');
        const fixed =
          open === -1
            ? [message]
            : [message.slice(0, open), message.slice(message.lastIndexOf('}') + 1)];
        for (const part of fixed.filter((text) => text.trim().length > 1)) {
          expect(rendered, `${locale} email.emailChangeCode.${key}: "${part}"`).toContain(part);
        }
      }
    },
  );

  it('follows the glossary: e-mailadres in Dutch, email address in English', async () => {
    const nl = await renderEmail(emailChangeCodeEmail, props, { locale: 'nl-NL' });
    const en = await renderEmail(emailChangeCodeEmail, props, { locale: 'en' });

    expect(nl.subject).toBe('Je code om je e-mailadres te wijzigen');
    expect(en.subject).toBe('Your code to change your email address');
    expect(nl.text).toContain('e-mailadres');
    expect(nl.text).not.toMatch(/verifi|token|OTP|pincode/i);
    expect(en.text).not.toMatch(/token|OTP|PIN/);
  });

  it.each(locales)('%s: says "1 minute" in the singular', async (locale) => {
    const email = await renderEmail(
      emailChangeCodeEmail,
      { ...props, expiresInMinutes: 1 },
      { locale },
    );
    expect(email.text).toMatch(/\b1 minuut\b|\b1 minute\b/);
  });
});
