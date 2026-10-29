import {
  dateTimeFormats,
  defaultLocale,
  defaultTimeZone,
  formattingLocales,
  type Locale,
  locales,
  messages,
  parseAcceptLanguage,
  resolveInterfaceLanguage,
} from '@fivvi/i18n';

/**
 * Cookie holding the language of this browser: the choice made before sign-in, and for a
 * signed-in browser the language stored on the account, which the route guard writes into it
 * on every load (F010).
 */
export const localeCookie = 'NEXT_LOCALE';

/** How long the browser keeps the language cookie: a year, renewed whenever it is rewritten. */
export const localeCookieMaxAge = 365 * 24 * 60 * 60;

/**
 * The request's interface language (ADR-017): the cookie, then the first supported browser
 * language, then English. The URL carries no locale (no i18n routing). For a signed-in browser
 * the cookie holds the stored preference (the route guard, `server/route-guard.ts`, writes it
 * there, so an older cookie never wins, F010); a booking link's fixed language joins the order
 * with public booking pages (M6).
 */
export function requestLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return resolveInterfaceLanguage({
    explicit: cookie,
    requested: parseAcceptLanguage(acceptLanguage),
  });
}

/**
 * next-intl configuration for a catalog locale. next-intl runs on the formatting locale
 * (`en` → `en-GB`), so its formatters and `<html lang>` use day-month order and 24-hour
 * time without extra options (packages/i18n/GLOSSARY.md §3.1).
 */
export function intlConfig(locale: Locale) {
  return {
    locale: formattingLocales[locale],
    messages: messages[locale],
    timeZone: defaultTimeZone,
    formats: { dateTime: dateTimeFormats },
  };
}

/** The catalog locale next-intl runs on `formattingLocale` for (`en-GB` → `en`). */
export function catalogLocale(formattingLocale: string): Locale {
  return locales.find((locale) => formattingLocales[locale] === formattingLocale) ?? defaultLocale;
}
