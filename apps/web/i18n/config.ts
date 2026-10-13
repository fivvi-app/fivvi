import {
  dateTimeFormats,
  defaultTimeZone,
  formattingLocales,
  type Locale,
  messages,
  parseAcceptLanguage,
  resolveLocale,
} from '@trainer-hub/i18n';

/** Cookie holding an explicit language choice. The language switch arrives with F010. */
export const localeCookie = 'NEXT_LOCALE';

/**
 * The request's catalog locale. The URL carries no locale (no i18n routing). The stored
 * preference and workspace default join the order once users and workspaces exist (M2).
 */
export function requestLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return resolveLocale({ explicit: cookie, requested: parseAcceptLanguage(acceptLanguage) });
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
