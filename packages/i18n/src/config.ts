/** Catalog locales. `nl-NL` is the source language and the final fallback (ADR-008). */
export const locales = ['nl-NL', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'nl-NL';

/**
 * Top-level namespaces rendered only on the server. Their keys follow every catalog rule
 * (parity, ICU subset), but the native exporters leave them out: the apps never show them.
 * `email`: transactional email copy, rendered by `packages/email` (ADR-009).
 */
export const serverOnlyNamespaces = ['email'] as const;

/** Workspace time zone used when nothing more specific is known (ADR-012). */
export const defaultTimeZone = 'Europe/Amsterdam';

/**
 * Locale passed to Intl for dates, times, numbers and plural rules. The `en` catalog
 * formats as `en-GB`: day-month order and 24-hour time (packages/i18n/GLOSSARY.md §3.1).
 */
export const formattingLocales = {
  'nl-NL': 'nl-NL',
  en: 'en-GB',
} as const satisfies Record<Locale, string>;
export type FormattingLocale = (typeof formattingLocales)[Locale];

/**
 * Named Intl.DateTimeFormat options. Format dates and times in code with these and pass
 * the result into a `{date}` / `{time}` placeholder; the catalogs never contain ICU
 * date skeletons, because they don't export to native catalogs (packages/i18n/GLOSSARY.md §3.1).
 */
export const dateTimeFormats = {
  /** nl-NL: dinsdag 22 september 2026 · en: Tuesday, 22 September 2026 */
  dateWithYear: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  /** nl-NL: dinsdag 22 september · en: Tuesday 22 September */
  date: { weekday: 'long', day: 'numeric', month: 'long' },
  /** 18:00 in both locales */
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;
export type DateTimeFormatName = keyof typeof dateTimeFormats;
