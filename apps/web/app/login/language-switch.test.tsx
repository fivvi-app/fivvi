import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { LanguageSwitch } from './language-switch';

// Refreshing needs the router of a running app; clicking is in e2e/language.spec.ts.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

describe.each(locales)('F010 language switch of the sign-in page in %s', (locale) => {
  const copy = messages[locale].signIn;

  it('AC4: offers both languages in their own language and marks the current one', () => {
    const html = render(locale, <LanguageSwitch />);

    expect(html).toContain(copy.languageLabel);
    const pressed = (name: string, value: boolean) =>
      new RegExp(`<button[^>]*aria-pressed="${value}"[^>]*>${name}</button>`);
    expect(html).toMatch(pressed(copy.languageNl, locale === 'nl-NL'));
    expect(html).toMatch(pressed(copy.languageEn, locale === 'en'));
  });
});
