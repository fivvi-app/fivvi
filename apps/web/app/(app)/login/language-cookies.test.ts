import { SIGN_IN_LANGUAGE_COOKIE } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { chooseSignInLanguage } from './language-cookies';

/** Collects every cookie assignment, as a browser's `document.cookie` would receive them. */
function jar() {
  const written: string[] = [];
  return {
    written,
    set cookie(value: string) {
      written.push(value);
    },
    get cookie() {
      return '';
    },
  };
}

describe('F010 language cookies of the sign-in page', () => {
  it.each(['nl-NL', 'en'] as const)(
    'AC4: choosing %s sets NEXT_LOCALE for a year and the sign-in choice',
    (locale) => {
      const target = jar();

      chooseSignInLanguage(locale, target);

      expect(target.written).toHaveLength(2);
      expect(target.written[0]).toBe(
        `NEXT_LOCALE=${locale}; path=/; samesite=lax; max-age=${365 * 24 * 60 * 60}`,
      );
      expect(target.written[1]).toMatch(
        new RegExp(`^${SIGN_IN_LANGUAGE_COOKIE}=${locale}; path=/; samesite=lax; max-age=\\d+$`),
      );
    },
  );
});
