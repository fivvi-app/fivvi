import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render.tsx';
import { signInEmail } from './sign-in.tsx';

const props = {
  code: '482915',
  url: 'https://fivvi.example.com/login/confirm?token=Zq3vB9xTj2LwK8mN',
  expiresInMinutes: 15,
};

describe('F001 EM-08 sign-in email', () => {
  it.each(locales)(
    'AC1: EM-08 renders in %s with the code, the sign-in link and how long both work',
    async (locale) => {
      const copy = messages[locale].email.signIn;
      const email = await renderEmail(signInEmail, props, { locale });

      expect(email.subject).toBe(copy.subject);
      expect(email.html).toContain(`<title>${copy.subject}</title>`);
      for (const part of [email.html, email.text]) {
        expect(part).toContain('482915');
        expect(part).toContain(copy.intro);
      }
      // The HTML escapes apostrophes, so the closing line is compared in the text version.
      expect(email.text).toContain(copy.ignore);
      expect(email.html).toContain(`href="${props.url}"`);
      expect(email.text).toContain(props.url);
      expect(email.text).toContain('15');
    },
  );

  it('AC1: the wording follows the glossary: inloglink and inloggen in Dutch, sign-in link in English', async () => {
    const nl = await renderEmail(signInEmail, props, { locale: 'nl-NL' });
    const en = await renderEmail(signInEmail, props, { locale: 'en' });

    expect(nl.subject).toBe('Je inlogcode voor Fivvi');
    expect(en.subject).toBe('Your sign-in code for Fivvi');
    // The link's own address contains /login/, which is not copy.
    const nlCopy = nl.text.replaceAll(props.url, '');
    const enCopy = en.text.replaceAll(props.url, '');
    expect(nlCopy).toContain('inloglink');
    expect(nlCopy).not.toMatch(/magic link|magische link|log in|login|aanmeld/i);
    expect(enCopy).toContain('sign-in link');
    expect(enCopy).not.toMatch(/magic link|log in|login/i);
  });

  it.each(locales)('%s: says "1 minute" in the singular', async (locale) => {
    const email = await renderEmail(signInEmail, { ...props, expiresInMinutes: 1 }, { locale });
    expect(email.text).toMatch(/\b1 minuut\b|\b1 minute\b/);
  });

  it('escapes nothing it should not: the code is shown as given', async () => {
    const email = await renderEmail(signInEmail, { ...props, code: '000123' }, { locale: 'en' });
    expect(email.text).toContain('000123');
  });
});
