import {
  dateTimeFormats,
  defaultTimeZone,
  formattingLocales,
  type Locale,
  messages,
  parseAcceptLanguage,
  resolveInterfaceLanguage,
} from '@trainer-hub/i18n';

/** Cookie holding an explicit language choice. The language switch arrives with F010. */
export const localeCookie = 'NEXT_LOCALE';

/**
 * The request's interface language (ADR-017): the cookie, then the first supported browser
 * language, then English. The URL carries no locale (no i18n routing). The stored preference
 * joins the order with signed-in users (F010, M2), a booking link's fixed language with
 * public booking pages (M6).
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
